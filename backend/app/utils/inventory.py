from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.batch import MedicineBatch
from app.models.medicine_unit import MedicineUnit
from app.models.custody_ledger import CustodyLedger
from app.models.transaction import Transaction


def batch_inventories(db: Session, batches):
    """Return one inventory source per batch: serialized units or legacy counts."""
    batches = list(batches)
    if not batches:
        return {}
    unit_counts = defaultdict(dict)
    rows = (
        db.query(MedicineUnit.batch_id, MedicineUnit.status, func.count(MedicineUnit.id))
        .filter(MedicineUnit.batch_id.in_([batch.id for batch in batches]))
        .group_by(MedicineUnit.batch_id, MedicineUnit.status)
        .all()
    )
    for batch_id, status, count in rows:
        unit_counts[batch_id][status] = int(count)

    sales_by_batch = {
        batch_id: int(quantity or 0)
        for batch_id, quantity in (
            db.query(Transaction.batch_id, func.sum(Transaction.quantity))
            .filter(Transaction.batch_id.in_([batch.id for batch in batches]))
            .group_by(Transaction.batch_id)
            .all()
        )
    }

    result = {}
    for batch in batches:
        counts = unit_counts.get(batch.id)
        if counts:
            total = sum(counts.values())
            sold_units = counts.get("sold", 0)
            recorded_sales = sales_by_batch.get(batch.id, 0)
            # Sales are recorded in both the serialized unit status and the
            # transaction ledger. Use either source to avoid stale stock when
            # one write was missed, without double-counting the same sale.
            sold = min(total, max(sold_units, recorded_sales))
            result[batch.id] = {
                "serialized": True,
                "total": total,
                "sold": sold,
                "remaining": total - sold,
                "available": counts.get("available", 0),
                "pending_transfer": counts.get("pending_transfer", 0),
                "reserved": counts.get("reserved", 0),
                "quarantined": counts.get("quarantined", 0),
                "forecast_stock": sum(counts.get(s, 0) for s in ("available", "pending_transfer", "reserved")),
            }
        else:
            sold = int(batch.quantity_sold or 0)
            total = int(batch.quantity or 0)
            remaining = max(0, total - sold)
            result[batch.id] = {
                "serialized": False,
                "total": total,
                "sold": sold,
                "remaining": remaining,
                "available": remaining,
                "pending_transfer": 0,
                "reserved": 0,
                "quarantined": 0,
                "forecast_stock": remaining,
            }
    return result


def owner_inventory(db: Session, user_id: int):
    """Serialized unit holdings only; legacy ownership is intentionally unknown."""
    rows = (
        db.query(MedicineBatch, MedicineUnit.status, func.count(MedicineUnit.id))
        .join(MedicineUnit, MedicineUnit.batch_id == MedicineBatch.id)
        .filter(MedicineUnit.current_owner_id == user_id)
        .group_by(MedicineBatch.id, MedicineUnit.status)
        .all()
    )
    by_batch = {}
    for batch, status, count in rows:
        item = by_batch.setdefault(batch.id, {"batch": batch, "available": 0, "pending_transfer": 0,
                                             "reserved": 0, "quarantined": 0, "held": 0})
        if status in ("available", "pending_transfer", "reserved", "quarantined"):
            item["held"] += int(count)
        if status in ("available", "pending_transfer", "reserved", "quarantined"):
            item[status] += int(count)
    return list(by_batch.values())


def sync_batch_unit_owner(db: Session, batch_id: int):
    """Apply the latest confirmed batch receipt to its available serialized units.

    Batch-level receiving is the workflow used by the app. Older batches may
    already have custody receipts without the matching per-unit owner update,
    so synchronize on inventory use as well as when recording a receipt.
    """
    receipt = (db.query(CustodyLedger)
               .filter(CustodyLedger.batch_id == batch_id,
                       CustodyLedger.event_type == "TRANSFERRED",
                       CustodyLedger.actor_role.in_(("distributor", "pharmacy")))
               .order_by(CustodyLedger.id.desc()).first())
    if not receipt:
        return None

    units = (db.query(MedicineUnit)
             .filter(MedicineUnit.batch_id == batch_id,
                     MedicineUnit.status == "available")
             .with_for_update().all())
    for unit in units:
        unit.current_owner_id = receipt.actor_id
    return receipt.actor_id
