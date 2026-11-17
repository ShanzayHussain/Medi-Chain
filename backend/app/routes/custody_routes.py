from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.batch import MedicineBatch
from app.models.custody_ledger import CustodyLedger
from app.models.user import User
from app.schemas import CustodyTransfer
from app.auth.dependencies import require_role
from app.utils.ledger import append_custody_event, verify_chain
from app.utils.coldchain import coldchain_summary
from app.utils.unit_chain import unit_supply_chain_summary
from app.utils.ids import parse_uuid
from app.utils.inventory import batch_inventories, sync_batch_unit_owner

router = APIRouter(prefix="/custody", tags=["custody"])

@router.post("/transfer")
def transfer_custody(
    transfer: CustodyTransfer,
    db: Session = Depends(get_db),
    user=Depends(require_role(["distributor", "pharmacy"])),
):
    batch_uid = parse_uuid(transfer.batch_uid, "batch ID")
    batch = db.query(MedicineBatch).filter(MedicineBatch.batch_uid == batch_uid).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Reuse check: a fully sold batch shouldn't be transferred again
    if batch.status in ("sold", "sold_out"):
        raise HTTPException(
            status_code=400,
            detail="This batch is fully sold, custody cannot be transferred again. Possible QR reuse or counterfeit.",
        )

    prior_events = (
        db.query(CustodyLedger)
        .filter(CustodyLedger.batch_id == batch.id)
        .order_by(CustodyLedger.id.asc())
        .all()
    )
    has_manufacturer_creation = any(
        event.event_type == "CREATED" and event.actor_role == "manufacturer"
        for event in prior_events
    )
    has_distributor_receipt = any(
        event.event_type == "TRANSFERRED" and event.actor_role == "distributor"
        for event in prior_events
    )
    has_pharmacy_receipt = any(
        event.event_type == "TRANSFERRED" and event.actor_role == "pharmacy"
        for event in prior_events
    )

    if not has_manufacturer_creation:
        raise HTTPException(status_code=400, detail="Batch has no recorded manufacturer creation")
    if user["role"] == "distributor" and (has_distributor_receipt or has_pharmacy_receipt):
        raise HTTPException(status_code=400, detail="This batch has already been received downstream")
    if user["role"] == "pharmacy" and not has_distributor_receipt:
        raise HTTPException(
            status_code=400,
            detail="A distributor must receive this batch before a pharmacy can receive it",
        )
    if user["role"] == "pharmacy" and has_pharmacy_receipt:
        raise HTTPException(status_code=400, detail="This batch has already been received by a pharmacy")

    entry = append_custody_event(
        db=db,
        batch_id=batch.id,
        event_type="TRANSFERRED",
        actor_id=user["user_id"],
        actor_role=user["role"],
        location=transfer.location,
    )

    # Batch receipt hands the available serialized stock to this recipient.
    sync_batch_unit_owner(db, batch.id)

    batch.status = "in_transit"
    db.commit()

    return {
        "message": "Custody transfer recorded",
        "ledger_entry_id": entry.id,
        "current_hash": entry.current_hash,
    }


@router.get("/verify/{batch_uid}")
def verify_batch(batch_uid: str, db: Session = Depends(get_db)):
    batch_uid = parse_uuid(batch_uid, "batch ID")
    batch = db.query(MedicineBatch).filter(MedicineBatch.batch_uid == batch_uid).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    result = verify_chain(db, batch.id)
    result["chain_intact"] = result["valid"]
    result["batch_uid"] = str(batch.batch_uid)
    result["drug_name"] = batch.drug_name
    result["batch_status"] = batch.status

    # Expiry
    is_expired = batch.expiry_date < date.today()
    result["is_expired"] = is_expired
    result["expiry_date"] = batch.expiry_date.isoformat()
    if is_expired:
        result["valid"] = False
        result["reason"] = f"Batch expired on {batch.expiry_date.isoformat()}"

    # Stock
    inventory = batch_inventories(db, [batch])[batch.id]
    sold = inventory["sold"] if inventory["serialized"] else (batch.quantity_sold or 0)
    total = inventory["total"] if inventory["serialized"] else batch.quantity
    result["quantity_total"] = total
    result["quantity_sold"] = sold
    result["quantity_remaining"] = max(0, total - sold)
    result["sold_out"] = sold >= total
    if result["sold_out"]:
        result["warning"] = "All units of this batch are already sold. A new scan of this QR on a product may indicate reuse or counterfeit packaging."

    # Full supply-chain history for the customer screen
    rows = (
        db.query(CustodyLedger, User)
        .join(User, User.id == CustodyLedger.actor_id)
        .filter(CustodyLedger.batch_id == batch.id)
        .order_by(CustodyLedger.id.asc())
        .all()
    )
    result["history"] = [
        {
            "event": entry.event_type,
            "role": entry.actor_role,
            "organization": u.organization_name or u.name,
            "location": entry.location,
            "timestamp": entry.timestamp.isoformat() if entry.timestamp else None,
        }
        for entry, u in rows
    ]

    unit_chain = unit_supply_chain_summary(db, batch.id)
    if unit_chain:
        result["serialized_inventory"] = unit_chain
        if unit_chain["distributor_received_units"]:
            result["history"].append({
                "event": "RECEIVED", "role": "distributor",
                "organization": f"Recorded for {unit_chain['distributor_received_units']} of {unit_chain['unit_count']} units",
                "location": "Unit movement records", "timestamp": None,
            })
        if unit_chain["pharmacy_received_units"]:
            result["history"].append({
                "event": "RECEIVED", "role": "pharmacy",
                "organization": f"Recorded for {unit_chain['pharmacy_received_units']} of {unit_chain['unit_count']} units",
                "location": "Unit movement records", "timestamp": None,
            })

    required_stages = [
        ("CREATED", "manufacturer", "manufacturer creation"),
        ("TRANSFERRED", "distributor", "distributor receipt"),
        ("TRANSFERRED", "pharmacy", "pharmacy receipt"),
    ]
    stage_positions = [
        next((i for i, (entry, _) in enumerate(rows)
              if entry.event_type == event_type and entry.actor_role == role), None)
        for event_type, role, _ in required_stages
    ]
    # Batch QR verification follows the batch custody ledger. Unit movement
    # events are useful inventory detail, but must not override confirmed
    # manufacturer → distributor → pharmacy batch hand-offs.
    supply_chain_complete = (
        all(position is not None for position in stage_positions)
        and stage_positions == sorted(stage_positions)
    )
    result["supply_chain_complete"] = supply_chain_complete
    if not supply_chain_complete:
        missing = [
            label for (_, _, label), position in zip(required_stages, stage_positions)
            if position is None
        ]
        if unit_chain:
            detail = f"{unit_chain['incomplete_units']} of {unit_chain['unit_count']} units have incomplete hand-offs"
        else:
            detail = "missing " + " and ".join(missing) if missing else "recorded hand-offs are out of order"
        result["valid"] = False
        result["reason"] = f"Incomplete supply chain: {detail}"

    # Cold chain
    cc = coldchain_summary(db, batch)
    result["cold_chain"] = cc
    if cc["required"] and cc["status"] == "breached" and result["valid"]:
        result["valid"] = False
        result["reason"] = f"Cold chain breached: {cc['breaches']} reading(s) outside {cc['range']}"

    result["price_pkr"] = batch.price_pkr or 0
    return result
