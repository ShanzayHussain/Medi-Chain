from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.batch import MedicineBatch
from app.schemas import BatchCreate
from app.auth.dependencies import require_role
from app.utils.ledger import append_custody_event
from app.utils.qr_generator import generate_qr_base64

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
    )
    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)

    append_custody_event(
        db=db,
        batch_id=new_batch.id,
        event_type="CREATED",
        actor_id=user["user_id"],
        actor_role=user["role"],
        location="Manufacturer facility",
    )

    qr_base64 = generate_qr_base64(str(new_batch.batch_uid))

    return {
        "batch_id": new_batch.id,
        "batch_uid": str(new_batch.batch_uid),
        "status": new_batch.status,
        "qr_code_base64": qr_base64,
    }


@router.get("/{batch_uid}")
def get_batch(batch_uid: str, db: Session = Depends(get_db)):
    batch = db.query(MedicineBatch).filter(MedicineBatch.batch_uid == batch_uid).first()
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