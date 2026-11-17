from datetime import date, datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_optional_current_user, require_role
from app.database import get_db
from app.models.batch import MedicineBatch
from app.models.custody_ledger import CustodyLedger
from app.models.flag import Flag
from app.models.medicine_unit import MedicineUnit
from app.models.unit_movement import UnitMovementEvent
from app.models.unit_transfer import UnitTransferOperation
from app.models.user import User
from app.schemas import UnitTransferCreate
from app.utils.coldchain import coldchain_summary
from app.utils.ledger import verify_chain
from app.utils.inventory import batch_inventories

unit_router = APIRouter(prefix="/units", tags=["units"])
transfer_router = APIRouter(prefix="/unit-transfers", tags=["unit transfers"])

NEXT_ROLE = {"manufacturer": "distributor", "distributor": "pharmacy"}


def parse_unit_uid(value: str) -> uuid.UUID:
    if value.startswith("MCU:"):
        value = value[4:]
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid medicine unit ID")


def get_unit_or_404(db: Session, unit_uid: str) -> MedicineUnit:
    uid = parse_unit_uid(unit_uid)
    unit = db.query(MedicineUnit).filter(MedicineUnit.unit_uid == uid).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Medicine unit not found")
    return unit


def unit_verification(db: Session, unit: MedicineUnit, duplicate_scan=False):
    batch = db.get(MedicineBatch, unit.batch_id)
    inventory = batch_inventories(db, [batch])[batch.id]
    units_total = inventory["total"] if inventory["serialized"] else batch.quantity
    units_sold = inventory["sold"] if inventory["serialized"] else (batch.quantity_sold or 0)
    events = (
        db.query(UnitMovementEvent)
        .filter(UnitMovementEvent.unit_id == unit.id)
        .order_by(UnitMovementEvent.id.asc())
        .all()
    )
    actor_ids = {event.actor_id for event in events if event.actor_id is not None}
    actor_roles = {
        user_id: role for user_id, role in
        db.query(User.id, User.role).filter(User.id.in_(actor_ids or {-1})).all()
    }
    # A consumer's unit QR identifies its parent batch. Supply-chain trust is
    # therefore determined by the confirmed batch hand-offs, not by whether
    # every package has a duplicate unit-level receive record.
    custody_events = (
        db.query(CustodyLedger)
        .filter(CustodyLedger.batch_id == batch.id)
        .order_by(CustodyLedger.id.asc())
        .all()
    )
    stages = [
        next((i for i, event in enumerate(custody_events)
              if event.event_type == "CREATED" and event.actor_role == "manufacturer"), None),
        next((i for i, event in enumerate(custody_events)
              if event.event_type == "TRANSFERRED" and event.actor_role == "distributor"), None),
        next((i for i, event in enumerate(custody_events)
              if event.event_type == "TRANSFERRED" and event.actor_role == "pharmacy"), None),
    ]
    chain_complete = all(i is not None for i in stages) and stages == sorted(stages)
    expired = batch.expiry_date < date.today()
    cold = coldchain_summary(db, batch)
    flags = db.query(Flag).filter(Flag.batch_id == batch.id, Flag.resolved == False).all()
    open_flags = sum(
        1 for flag in flags
        if (
            # Serialized-unit reuse flags are stored with the parent batch,
            # but only apply to the package whose serial appears in the flag.
            (not flag.reason.startswith("Serialized unit reuse suspected:")
             or flag.reason.startswith(f"Serialized unit reuse suspected: {unit.serial_number} "))
            and not (chain_complete and flag.reason.startswith("AI [")
                     and "Incomplete supply chain:" in flag.reason)
        )
    )
    findings = []
    if not chain_complete:
        findings.append({"severity": "high", "reason": "Incomplete manufacturer → distributor → pharmacy history"})
    if expired:
        findings.append({"severity": "medium", "reason": "Batch is past its expiry date"})
    if unit.status == "quarantined":
        findings.append({"severity": "high", "reason": "This medicine unit is quarantined"})
    chain_intact = verify_chain(db, batch.id)["valid"]
    if not chain_intact:
        findings.append({"severity": "high", "reason": "Batch custody records failed integrity verification"})
    if cold.get("required") and cold.get("status") == "breached":
        findings.append({"severity": "high", "reason": "Batch cold-chain breach recorded"})
    if open_flags:
        findings.append({"severity": "high", "reason": "Open safety flag recorded for this batch"})
    if duplicate_scan:
        findings.append({"severity": "high", "reason": "Previously sold unit scanned again; possible QR reuse"})

    risk = "high" if any(item["severity"] == "high" for item in findings) else (
        "medium" if findings else "low"
    )
    owner_role = None
    if unit.current_owner_id is not None:
        owner_role = db.query(User.role).filter(User.id == unit.current_owner_id).scalar()

    history = [
        {
            "event": event.event_type,
            "role": event.actor_role,
            "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        }
        for event in custody_events[-100:]
        if event.event_type != "SOLD"
    ]
    if unit.status == "sold":
        history.extend(
            {
                "event": "SOLD",
                "role": actor_roles.get(event.actor_id, "unknown"),
                "timestamp": event.occurred_at.isoformat() if event.occurred_at else None,
            }
            for event in events
            if event.event_type == "sold"
        )
    history.sort(key=lambda event: event["timestamp"] or "")
    return {
        "unit_uid": str(unit.unit_uid),
        "serial_number": unit.serial_number,
        "drug_name": batch.drug_name,
        "batch_uid": str(batch.batch_uid),
        "manufacture_date": batch.manufacture_date.isoformat(),
        "expiry_date": batch.expiry_date.isoformat(),
        "is_expired": expired,
        # Do not return internal user IDs, names, email addresses, organization
        # names, or precise locations from the private ownership ledger.
        "manufacturer": "Registered manufacturer",
        "current_owner_role": owner_role,
        "status": unit.status,
        "supply_chain_complete": chain_complete,
        "chain_intact": chain_intact,
        "valid": not findings,
        "quantity_total": units_total,
        "quantity_remaining": max(0, units_total - units_sold),
        "sold_out": unit.status == "sold",
        "price_pkr": batch.price_pkr or 0,
        "cold_chain": cold,
        "history": history,
        "risk_level": risk,
        "findings": findings,
        "duplicate_scan": duplicate_scan,
    }


@unit_router.get("/{unit_uid}")
def verify_unit(unit_uid: str, db: Session = Depends(get_db)):
    unit = get_unit_or_404(db, unit_uid)
    return unit_verification(db, unit)


@unit_router.post("/{unit_uid}/scan")
def record_unit_scan(
    unit_uid: str,
    db: Session = Depends(get_db),
    user=Depends(get_optional_current_user),
):
    unit = get_unit_or_404(db, unit_uid)
    last_sale = (db.query(UnitMovementEvent)
                 .filter(UnitMovementEvent.unit_id == unit.id,
                         UnitMovementEvent.event_type == "sold")
                 .order_by(UnitMovementEvent.id.desc()).first())
    # Any scan after a unit has been sold must be visible to the customer as
    # a reuse warning, including the first scan after the pharmacy sale.
    duplicate = unit.status == "sold" and last_sale is not None
    db.add(UnitMovementEvent(
        unit_id=unit.id,
        event_type="scanned",
        actor_id=user["user_id"] if user else None,
    ))
    if duplicate:
        already_flagged = db.query(UnitMovementEvent).filter(
            UnitMovementEvent.unit_id == unit.id,
            UnitMovementEvent.event_type == "flagged",
        ).first()
        if not already_flagged:
            db.add(UnitMovementEvent(
                unit_id=unit.id,
                event_type="flagged",
                actor_id=user["user_id"] if user else None,
            ))
        flag_reason = f"Serialized unit reuse suspected: {unit.serial_number} scanned again after sale"[:200]
        existing_flag = db.query(Flag).filter(
            Flag.batch_id == unit.batch_id,
            Flag.reason == flag_reason,
        ).first()
        if existing_flag and existing_flag.resolved:
            existing_flag.resolved = False
        elif not existing_flag:
            db.add(Flag(batch_id=unit.batch_id, reason=flag_reason))
    db.commit()
    return unit_verification(db, unit, duplicate_scan=duplicate)


@transfer_router.get("/recipients")
def list_transfer_recipients(
    db: Session = Depends(get_db),
    user=Depends(require_role(["manufacturer", "distributor"])),
):
    recipient_role = NEXT_ROLE[user["role"]]
    recipients = db.query(User).filter(User.role == recipient_role).order_by(User.id).all()
    return {
        "items": [
            {"id": row.id, "role": row.role, "organization": row.organization_name or "Registered account"}
            for row in recipients
        ]
    }


@transfer_router.post("")
def create_unit_transfer(
    body: UnitTransferCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["manufacturer", "distributor"])),
):
    if len(set(body.unit_uids)) != len(body.unit_uids):
        raise HTTPException(status_code=400, detail="The unit list contains duplicate IDs")
    try:
        unit_ids = [uuid.UUID(value.removeprefix("MCU:")) for value in body.unit_uids]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid medicine unit ID")

    recipient = db.get(User, body.recipient_id)
    if not recipient or recipient.role != NEXT_ROLE[user["role"]]:
        raise HTTPException(status_code=400, detail="Recipient role is not valid for this hand-off")

    units = (
        db.query(MedicineUnit)
        .filter(MedicineUnit.unit_uid.in_(unit_ids))
        .order_by(MedicineUnit.id)
        .with_for_update()
        .all()
    )
    if len(units) != len(unit_ids):
        raise HTTPException(status_code=404, detail="One or more medicine units were not found")
    if any(unit.current_owner_id != user["user_id"] or unit.status != "available" for unit in units):
        raise HTTPException(status_code=409, detail="One or more units are not available in your inventory")

    operation = UnitTransferOperation(
        sender_id=user["user_id"], recipient_id=recipient.id, location=body.location.strip(),
    )
    db.add(operation)
    db.flush()
    for unit in units:
        unit.status = "pending_transfer"
        unit.pending_transfer_id = operation.id
        db.add(UnitMovementEvent(
            unit_id=unit.id,
            transfer_operation_id=operation.id,
            event_type="transfer_requested",
            actor_id=user["user_id"],
            from_owner_id=user["user_id"],
            to_owner_id=recipient.id,
            location=body.location.strip(),
        ))
    db.commit()
    return {
        "operation_uid": str(operation.operation_uid),
        "status": operation.status,
        "unit_count": len(units),
        "recipient_role": recipient.role,
    }


@transfer_router.get("/pending")
def pending_unit_transfers(
    db: Session = Depends(get_db),
    user=Depends(require_role(["distributor", "pharmacy"])),
):
    operations = (
        db.query(UnitTransferOperation)
        .filter(UnitTransferOperation.recipient_id == user["user_id"],
                UnitTransferOperation.status == "pending")
        .order_by(UnitTransferOperation.id.desc())
        .all()
    )
    return {
        "items": [
            {
                "operation_uid": str(operation.operation_uid),
                "status": operation.status,
                "location": operation.location,
                "created_at": operation.created_at.isoformat() if operation.created_at else None,
                "unit_count": db.query(MedicineUnit).filter(
                    MedicineUnit.pending_transfer_id == operation.id
                ).count(),
            }
            for operation in operations
        ]
    }


@transfer_router.post("/{operation_uid}/receive")
def receive_unit_transfer(
    operation_uid: str,
    db: Session = Depends(get_db),
    user=Depends(require_role(["distributor", "pharmacy"])),
):
    try:
        uid = uuid.UUID(operation_uid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid transfer ID")
    operation = (
        db.query(UnitTransferOperation)
        .filter(UnitTransferOperation.operation_uid == uid)
        .with_for_update()
        .first()
    )
    if not operation:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if operation.recipient_id != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the intended recipient can confirm this transfer")
    if operation.status != "pending":
        raise HTTPException(status_code=409, detail=f"Transfer is already {operation.status}")

    units = (
        db.query(MedicineUnit)
        .filter(MedicineUnit.pending_transfer_id == operation.id)
        .order_by(MedicineUnit.id)
        .with_for_update()
        .all()
    )
    if not units or any(unit.status != "pending_transfer" for unit in units):
        raise HTTPException(status_code=409, detail="Transfer no longer contains the expected units")
    for unit in units:
        previous_owner_id = unit.current_owner_id
        unit.current_owner_id = user["user_id"]
        unit.status = "available"
        unit.pending_transfer_id = None
        db.add(UnitMovementEvent(
            unit_id=unit.id,
            transfer_operation_id=operation.id,
            event_type="received",
            actor_id=user["user_id"],
            from_owner_id=previous_owner_id,
            to_owner_id=user["user_id"],
            location=operation.location,
        ))
    operation.status = "received"
    operation.received_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Transfer received", "unit_count": len(units), "status": operation.status}
