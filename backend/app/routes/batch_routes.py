import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.batch import MedicineBatch
from app.models.medicine_unit import MedicineUnit
from app.models.unit_movement import UnitMovementEvent
from app.schemas import BatchCreate
from app.auth.dependencies import require_role
from app.utils.ledger import append_custody_event
from app.utils.qr_generator import generate_qr_base64
from app.utils.ids import parse_uuid

router = APIRouter(prefix="/batches", tags=["batches"])

@router.post("/")
def create_batch(
    batch: BatchCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["manufacturer"])),
):
    new_batch = MedicineBatch(
        drug_name=batch.drug_name,
        manufacturer_id=user["user_id"],
        quantity=batch.quantity,
        manufacture_date=batch.manufacture_date,
        expiry_date=batch.expiry_date,
        requires_cold_chain=batch.cold_chain,
        min_temp=batch.min_temp if batch.cold_chain else None,
        max_temp=batch.max_temp if batch.cold_chain else None,
        price_pkr=batch.price_pkr,
    )
    db.add(new_batch)
    db.flush()

    append_custody_event(
        db=db,
        batch_id=new_batch.id,
        event_type="CREATED",
        actor_id=user["user_id"],
        actor_role=user["role"],
        location="Manufacturer facility",
        commit=False,
    )

    units = []
    for _ in range(batch.quantity):
        unit_uid = uuid.uuid4()
        units.append(MedicineUnit(
            batch_id=new_batch.id,
            unit_uid=unit_uid,
            serial_number=f"MED-{uuid.uuid4().hex.upper()}",
            current_owner_id=user["user_id"],
            status="available",
        ))
    db.add_all(units)
    db.flush()

    db.add_all([
        UnitMovementEvent(
            unit_id=unit.id,
            event_type="created",
            actor_id=user["user_id"],
            to_owner_id=user["user_id"],
            location="Manufacturer facility",
        )
        for unit in units
    ])
    db.commit()
    db.refresh(new_batch)

    qr_base64 = generate_qr_base64(str(new_batch.batch_uid))

    return {
        "batch_id": new_batch.id,
        "batch_uid": str(new_batch.batch_uid),
        "status": new_batch.status,
        "unit_count": len(units),
        "qr_code_base64": qr_base64,
    }


@router.get("/{batch_uid}")
def get_batch(batch_uid: str, db: Session = Depends(get_db)):
    batch = db.query(MedicineBatch).filter(
        MedicineBatch.batch_uid == parse_uuid(batch_uid, "batch ID")
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {
        "batch_id": batch.id,
        "batch_uid": str(batch.batch_uid),
        "drug_name": batch.drug_name,
        "quantity": batch.quantity,
        "manufacture_date": batch.manufacture_date,
        "expiry_date": batch.expiry_date,
        "status": batch.status,
    }


@router.get("/{batch_uid}/unit-labels")
def get_unit_labels(
    batch_uid: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_role(["manufacturer", "admin"])),
):
    try:
        uid = uuid.UUID(batch_uid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid batch ID")

    batch = db.query(MedicineBatch).filter(MedicineBatch.batch_uid == uid).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] == "manufacturer" and batch.manufacturer_id != user["user_id"]:
        raise HTTPException(status_code=404, detail="Batch not found")

    query = db.query(MedicineUnit).filter(MedicineUnit.batch_id == batch.id)
    total = query.count()
    units = query.order_by(MedicineUnit.id).offset(offset).limit(limit).all()
    return {
        "batch_uid": str(batch.batch_uid),
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "unit_uid": str(unit.unit_uid),
                "serial_number": unit.serial_number,
                "qr_code_base64": generate_qr_base64(f"MCU:{unit.unit_uid}"),
            }
            for unit in units
        ],
    }
