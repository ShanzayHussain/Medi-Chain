from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.batch import MedicineBatch
from app.schemas import CustodyTransfer
from app.auth.dependencies import require_role
from app.utils.ledger import append_custody_event

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.post("/")
def create_transaction(
    sale: CustodyTransfer,   # reusing batch_uid + location fields; location can be "Sold to customer"
    db: Session = Depends(get_db),
    user=Depends(require_role(["pharmacy"])),
):
    batch = db.query(MedicineBatch).filter(MedicineBatch.batch_uid == sale.batch_uid).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.status == "sold":
        raise HTTPException(status_code=400, detail="Batch already marked as sold")

    entry = append_custody_event(
        db=db,
        batch_id=batch.id,
        event_type="SOLD",
        actor_id=user["user_id"],
        actor_role=user["role"],
        location=sale.location,
    )

    batch.status = "sold"
    db.commit()

    return {
        "message": "Sale recorded, batch marked as sold",
        "ledger_entry_id": entry.id,
        "current_hash": entry.current_hash,
    }


@router.get("/")
def list_transactions(user=Depends(require_role(["admin"]))):
    return {"message": "TODO: list all transactions"}