import statistics
from collections import defaultdict
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.batch import MedicineBatch
from app.models.custody_ledger import CustodyLedger
from app.models.transaction import Transaction
from app.models.flag import Flag
from app.models.temperature import TemperatureReading
from app.models.medicine_unit import MedicineUnit
from app.models.unit_movement import UnitMovementEvent
from app.utils.ledger import verify_chain
from app.utils.unit_chain import unit_supply_chain_summary

RANK = {"manufacturer": 0, "distributor": 1, "pharmacy": 2}


def detect(db: Session):
    findings = []

    def add(b, severity, reason):
        findings.append({"batch": b, "severity": severity, "reason": reason})

    batches = db.query(MedicineBatch).all()
    batch_map = {b.id: b for b in batches}
    events = defaultdict(list)
    for e in db.query(CustodyLedger).order_by(CustodyLedger.id).all():
        events[e.batch_id].append(e)
    breach_counts = dict(
        db.query(TemperatureReading.batch_id, func.count(TemperatureReading.id))
        .filter(TemperatureReading.is_breach == True)
        .group_by(TemperatureReading.batch_id).all()
    )
    unit_flag_counts = dict(
        db.query(MedicineUnit.batch_id, func.count(func.distinct(MedicineUnit.id)))
        .join(UnitMovementEvent, UnitMovementEvent.unit_id == MedicineUnit.id)
        .filter(UnitMovementEvent.event_type == "flagged")
        .group_by(MedicineUnit.batch_id).all()
    )

    # Rule-based checks, per batch
    for b in batches:
        ev = events[b.id]
        unit_chain = unit_supply_chain_summary(db, b.id)
        if not ev and not unit_chain:
            add(b, "high", "Incomplete supply chain: no manufacturer, distributor, or pharmacy records")
            continue

        if not verify_chain(db, b.id)["valid"]:
            add(b, "high", "Hash chain broken: custody records were altered")

        if ev and ev[0].event_type != "CREATED":
            add(b, "high", "History does not start with a CREATED event")

        # Customer verification requires the complete manufacturer →
        # distributor → pharmacy chain. A cryptographically intact partial
        # history is still incomplete and must not be presented as valid.
        if unit_chain:
            if not unit_chain["complete"]:
                add(b, "high", f"Incomplete supply chain: {unit_chain['incomplete_units']} of {unit_chain['unit_count']} serialized units have incomplete hand-offs")
        else:
            stages = [
                ("manufacturer creation", "CREATED", "manufacturer"),
                ("distributor receipt", "TRANSFERRED", "distributor"),
                ("pharmacy receipt", "TRANSFERRED", "pharmacy"),
            ]
            stage_positions = [
                next((i for i, e in enumerate(ev)
                      if e.event_type == event_type and e.actor_role == role), None)
                for _, event_type, role in stages
            ]
            if any(position is None for position in stage_positions) or stage_positions != sorted(stage_positions):
                missing = []
                for (label, _, _), position in zip(stages, stage_positions):
                    if position is None:
                        missing.append(label)
                detail = "missing recorded " + " and ".join(missing) if missing else "events are out of order"
                add(b, "high", "Incomplete supply chain: " + detail)

        top, received_by_pharmacy = 0, False
        for e in ev:
            if e.event_type == "TRANSFERRED":
                r = RANK.get(e.actor_role, 0)
                if r < top:
                    add(b, "medium", f"Custody moved backwards to a {e.actor_role}")
                top = max(top, r)
                if e.actor_role == "pharmacy":
                    received_by_pharmacy = True
            if not unit_chain and e.event_type == "SOLD" and not received_by_pharmacy:
                add(b, "high", "Sold without ever being received by a pharmacy")

        stamps = [e.timestamp for e in ev if e.timestamp]
        if any(later < earlier for earlier, later in zip(stamps, stamps[1:])):
            add(b, "high", "Event timestamps are out of order")
        if stamps and stamps[0].date() < b.manufacture_date:
            add(b, "medium", "Custody started before the manufacture date")
        if any(e.event_type == "SOLD" and e.timestamp and e.timestamp.date() > b.expiry_date for e in ev):
            add(b, "high", "Units were sold after the batch expired")

        hops = sum(1 for e in ev if e.event_type == "TRANSFERRED")
        if hops > 4:
            add(b, "medium", f"Unusually many custody transfers ({hops})")
        if (b.quantity_sold or 0) > b.quantity:
            add(b, "high", "More units sold than the batch contains")
        if breach_counts.get(b.id):
            add(b, "high", f"Cold chain breach ({breach_counts[b.id]} reading(s) out of range)")
        if unit_flag_counts.get(b.id):
            add(b, "high", f"Possible QR reuse flagged on {unit_flag_counts[b.id]} serialized unit(s)")

    # Statistical check: sale sizes that are outliers for that pharmacy (z-score > 2.5)
    by_seller = defaultdict(list)
    for t in db.query(Transaction).all():
        by_seller[t.seller_id].append(t)
    for rows in by_seller.values():
        qty = [t.quantity for t in rows]
        if len(qty) < 10:
            continue
        mean, sd = statistics.mean(qty), statistics.pstdev(qty)
        if sd == 0:
            continue
        for t in rows:
            if (t.quantity - mean) / sd > 2.5 and t.batch_id in batch_map:
                add(batch_map[t.batch_id], "medium",
                    f"Unusually large sale ({t.quantity} units, this pharmacy's typical sale is about {mean:.0f})")
    return findings


def run_and_save(db: Session):
    seen, unique = set(), []
    for f in detect(db):
        key = (f["batch"].id, f["reason"])
        if key not in seen:
            seen.add(key)
            unique.append(f)

    new = 0
    for flag in db.query(Flag).filter(Flag.resolved == False).all():
        if flag.reason.startswith("AI [") and "Incomplete supply chain:" in flag.reason:
            flag.resolved = True
    for f in unique:
        if f["reason"].startswith("Cold chain"):
            continue  # already flagged when the reading came in
        reason = f"AI [{f['severity']}] {f['reason']}"[:200]
        exists = db.query(Flag).filter(Flag.batch_id == f["batch"].id, Flag.reason == reason).first()
        if exists and exists.resolved:
            exists.resolved = False
            new += 1
        elif not exists:
            db.add(Flag(batch_id=f["batch"].id, reason=reason))
            new += 1
    db.commit()
    return unique, new
