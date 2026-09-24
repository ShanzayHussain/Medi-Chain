from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.batch import MedicineBatch
from app.schemas import CustodyTransfer
from app.auth.dependencies import require_role
from app.utils.ledger import append_custody_event, verify_chain

router = APIRouter(prefix="/custody", tags=["custody"])

@router.post("/transfer")
def transfer_custody(
    transfer: CustodyTransfer,
    db: Session = Depends(get_db),
    user=Depends(require_role(["distributor", "pharmacy"])),
):
    batch = db.query(MedicineBatch).filter(MedicineBatch.batch_uid == transfer.batch_uid).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Reuse check — a batch already sold shouldn't be transferred again
    if batch.status == "sold":
        raise HTTPException(
            status_code=400,
            detail="This batch is already marked as sold — custody cannot be transferred again. Possible QR reuse or counterfeit."
        )

    entry = append_custody_event(
        db=db,
        batch_id=batch.id,
        event_type="TRANSFERRED",
        actor_id=user["user_id"],
        actor_role=user["role"],
        location=transfer.location,
    )

    batch.status = "in_transit"
    db.commit()

    return {
        "message": "Custody transfer recorded",
        "ledger_entry_id": entry.id,
        "current_hash": entry.current_hash,
    }


@router.get("/verify/{batch_uid}")
def verify_batch(batch_uid: str, db: Session = Depends(get_db)):
    batch = db.query(MedicineBatch).filter(MedicineBatch.batch_uid == batch_uid).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    result = verify_chain(db, batch.id)
    result["batch_uid"] = batch_uid
    result["drug_name"] = batch.drug_name
    result["batch_status"] = batch.status

    # Expiry check
    is_expired = batch.expiry_date < date.today()
    result["is_expired"] = is_expired
    if is_expired:
        result["valid"] = False
        result["reason"] = f"Batch expired on {batch.expiry_date.isoformat()}"

    # Reuse/already-sold flag
    if batch.status == "sold":
        result["already_sold"] = True
        result["warning"] = "This batch was already marked as sold. Scanning it again may indicate reuse or counterfeit packaging."
    else:
        result["already_sold"] = False

    return result