from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.batch import MedicineBatch
from app.models.transaction import Transaction
from app.schemas import SaleCreate
from app.auth.dependencies import require_role
from app.utils.ledger import append_custody_event

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.post("/")
def create_transaction(
    sale: SaleCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["pharmacy"])),
):
    # with_for_update locks the row so two simultaneous sales can't oversell the batch
    batch = (
        db.query(MedicineBatch)
        .filter(MedicineBatch.batch_uid == sale.batch_uid)
        .with_for_update()
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    sold = batch.quantity_sold or 0
    remaining = batch.quantity - sold
    if sale.quantity > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Only {remaining} units left in this batch, cannot sell {sale.quantity}. Possible counterfeit or reused QR.",
        )

    db.add(Transaction(
        batch_id=batch.id,
        seller_id=user["user_id"],
        quantity=sale.quantity,
    ))
    batch.quantity_sold = sold + sale.quantity
    batch.status = "sold_out" if batch.quantity_sold >= batch.quantity else "in_stock"
    db.commit()

    # Ledger records the event; the unit count lives in the transactions table
    entry = append_custody_event(
        db=db,
        batch_id=batch.id,
        event_type="SOLD",
        actor_id=user["user_id"],
        actor_role=user["role"],
        location=sale.location,
    )

    return {
        "message": "Sale recorded",
        "units_sold": sale.quantity,
        "units_remaining": batch.quantity - batch.quantity_sold,
        "batch_status": batch.status,
        "ledger_entry_id": entry.id,
    }


@router.get("/")
def list_transactions(user=Depends(require_role(["admin"]))):
    return {"message": "TODO: list all transactions"}