from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.batch import MedicineBatch
from app.models.transaction import Transaction
from app.models.medicine_unit import MedicineUnit
from app.models.unit_movement import UnitMovementEvent
from app.models.flag import Flag
from app.schemas import SaleCreate
from app.schemas import UnitSaleCreate
from app.auth.dependencies import require_role
from app.utils.ledger import append_custody_event
from app.utils.inventory import batch_inventories, sync_batch_unit_owner
from app.utils.ids import parse_uuid

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("/unit")
def sell_scanned_unit(
    sale: UnitSaleCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["pharmacy"])),
):
    raw_uid = sale.unit_uid.removeprefix("MCU:")
    unit_uid = parse_uuid(raw_uid, "medicine unit ID")
    unit = db.query(MedicineUnit).filter(MedicineUnit.unit_uid == unit_uid).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Medicine unit not found")

    # Keep lock ordering consistent with batch quantity sales.
    batch = (db.query(MedicineBatch).filter(MedicineBatch.id == unit.batch_id)
             .with_for_update().first())
    sync_batch_unit_owner(db, batch.id)
    unit = (db.query(MedicineUnit).filter(MedicineUnit.id == unit.id)
            .with_for_update().first())
    if unit.status == "sold":
        reason = f"Serialized unit reuse suspected: {unit.serial_number} scanned for sale after it was sold"[:200]
        event = db.query(UnitMovementEvent).filter(
            UnitMovementEvent.unit_id == unit.id,
            UnitMovementEvent.event_type == "flagged",
        ).first()
        if not event:
            db.add(UnitMovementEvent(
                unit_id=unit.id, event_type="flagged", actor_id=user["user_id"],
                location=sale.location,
            ))
        flag = db.query(Flag).filter(Flag.batch_id == batch.id, Flag.reason == reason).first()
        if flag and flag.resolved:
            flag.resolved = False
        elif not flag:
            db.add(Flag(batch_id=batch.id, reason=reason))
        db.commit()
        raise HTTPException(status_code=409, detail="This medicine unit was already sold. Possible QR reuse or counterfeit; a safety flag was recorded.")

    if unit.status != "available" or unit.current_owner_id != user["user_id"]:
        raise HTTPException(status_code=409, detail="This medicine unit is not available at this pharmacy")

    unit.status = "sold"
    unit.current_owner_id = None
    db.add(Transaction(batch_id=batch.id, seller_id=user["user_id"], quantity=1))
    db.add(UnitMovementEvent(
        unit_id=unit.id, event_type="sold", actor_id=user["user_id"],
        from_owner_id=user["user_id"], location=sale.location,
    ))
    db.flush()
    sold = (db.query(func.count(MedicineUnit.id))
            .filter(MedicineUnit.batch_id == batch.id, MedicineUnit.status == "sold").scalar() or 0)
    batch.quantity_sold = sold
    batch.status = "sold_out" if sold >= batch.quantity else "in_stock"
    append_custody_event(
        db=db, batch_id=batch.id, event_type="SOLD",
        actor_id=user["user_id"], actor_role=user["role"],
        location=sale.location, commit=False,
    )
    db.commit()
    return {
        "message": "Medicine unit sale recorded",
        "unit_uid": str(unit.unit_uid),
        "units_sold": 1,
        "units_remaining": max(0, batch.quantity - sold),
        "batch_uid": str(batch.batch_uid),
    }

@router.post("/")
def create_transaction(
    sale: SaleCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["pharmacy"])),
):
    # with_for_update locks the row so two simultaneous sales can't oversell the batch
    batch = (
        db.query(MedicineBatch)
        .filter(MedicineBatch.batch_uid == parse_uuid(sale.batch_uid, "batch ID"))
        .with_for_update()
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    sync_batch_unit_owner(db, batch.id)
    inventory = batch_inventories(db, [batch])[batch.id]
    units = []
    if inventory["serialized"]:
        units = (db.query(MedicineUnit)
                 .filter(MedicineUnit.batch_id == batch.id,
                         MedicineUnit.current_owner_id == user["user_id"],
                         MedicineUnit.status == "available")
                 .order_by(MedicineUnit.id)
                 .limit(sale.quantity)
                 .with_for_update(skip_locked=True)
                 .all())
        remaining = inventory["available"]
        if len(units) < sale.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Only {len(units)} unreserved serialized units are available at this pharmacy",
            )
        sold = inventory["sold"]
    else:
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
    for unit in units:
        unit.status = "sold"
        unit.current_owner_id = None  # walk-in buyer identity is not collected
        db.add(UnitMovementEvent(
            unit_id=unit.id,
            event_type="sold",
            actor_id=user["user_id"],
            from_owner_id=user["user_id"],
            location=sale.location,
        ))

    # The batch event and unit-level sale history commit with the sale.
    entry = append_custody_event(
        db=db,
        batch_id=batch.id,
        event_type="SOLD",
        actor_id=user["user_id"],
        actor_role=user["role"],
        location=sale.location,
        commit=False,
    )
    db.commit()

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
