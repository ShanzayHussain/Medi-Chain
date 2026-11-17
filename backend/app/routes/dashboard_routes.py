from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.batch import MedicineBatch
from app.models.custody_ledger import CustodyLedger
from app.models.transaction import Transaction
from app.models.user import User
from app.auth.dependencies import require_role
from app.utils.ledger import verify_chain
from app.utils.inventory import batch_inventories, owner_inventory


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def batch_item(b, db: Session, legacy_owner_unknown=False):
    inventory = batch_inventories(db, [b])[b.id]
    tag = "expired" if b.expiry_date < date.today() else b.status
    subtitle = (
        f"Legacy batch; current unit ownership is not recorded • expires {b.expiry_date.isoformat()}"
        if legacy_owner_unknown else
        f"{inventory['remaining']} of {inventory['total']} units remain • expires {b.expiry_date.isoformat()}"
    )
    return {
        "title": b.drug_name,
        "subtitle": subtitle,
        "tag": tag,
        "batch_uid": str(b.batch_uid),
    }


def unit_inventory_item(item):
    b = item["batch"]
    detail = f"{item['held']} serialized unit(s) held • {item['available']} available"
    if item["pending_transfer"]:
        detail += f" • {item['pending_transfer']} pending transfer"
    if item["reserved"]:
        detail += f" • {item['reserved']} reserved for checkout"
    if item["quarantined"]:
        detail += f" • {item['quarantined']} quarantined"
    return {"title": b.drug_name, "subtitle": detail, "tag": "inventory",
            "batch_uid": str(b.batch_uid)}


def status_chart(batches):
    counts = {}
    for b in batches:
        k = "expired" if b.expiry_date < date.today() else b.status
        counts[k] = counts.get(k, 0) + 1
    return {"title": "Batches by status",
            "data": [{"label": k, "value": v} for k, v in counts.items()]}


def handled_batches(db: Session, user_id: int):
    """Batches this user has a custody event on (received, transferred or sold)."""
    ids = [r[0] for r in db.query(CustodyLedger.batch_id)
           .filter(CustodyLedger.actor_id == user_id).distinct().all()]
    if not ids:
        return []
    return (db.query(MedicineBatch)
            .filter(MedicineBatch.id.in_(ids))
            .order_by(MedicineBatch.id.desc()).all())


@router.get("/manufacturer")
def manufacturer_dashboard(db: Session = Depends(get_db),
                           user=Depends(require_role(["manufacturer"]))):
    batches = (db.query(MedicineBatch)
               .filter(MedicineBatch.manufacturer_id == user["user_id"])
               .order_by(MedicineBatch.id.desc()).all())
    inventories = batch_inventories(db, batches)
    tampered = sum(1 for b in batches if not verify_chain(db, b.id)["valid"])
    return {
        "summary": {
            "Total batches": len(batches),
            "Units produced": sum(inventories[b.id]["total"] for b in batches),
            "Units sold": sum(inventories[b.id]["sold"] for b in batches),
            "Expired batches": sum(1 for b in batches if b.expiry_date < date.today()),
            "Tampered chains": tampered,
        },
        "charts": [
            status_chart(batches),
            {"title": "Units sold per batch (latest 6)",
             "data": [{"label": b.drug_name[:14], "value": inventories[b.id]["sold"]} for b in batches[:6]]},
        ],
        "sections": [{"title": "My batches", "items": [batch_item(b, db) for b in batches]}],
    }


@router.get("/distributor")
def distributor_dashboard(db: Session = Depends(get_db),
                          user=Depends(require_role(["distributor"]))):
    batches = handled_batches(db, user["user_id"])
    owned = owner_inventory(db, user["user_id"])
    owned_by_id = {item["batch"].id: item for item in owned}
    all_batches = {b.id: b for b in batches}
    all_batches.update({b_id: item["batch"] for b_id, item in owned_by_id.items()})
    legacy_batches = [b for b in batches if b.id not in owned_by_id and
                      not batch_inventories(db, [b])[b.id]["serialized"]]
    return {
        "summary": {
            "Batches handled": len(all_batches),
            "Serialized units held": sum(item["held"] for item in owned),
            "Serialized units available": sum(item["available"] for item in owned),
            "Expired batches": sum(1 for b in all_batches.values() if b.expiry_date < date.today()),
        },
        "charts": [status_chart(list(all_batches.values()))],
        "sections": [
            {"title": "Serialized inventory", "items": [unit_inventory_item(item) for item in owned]},
            {"title": "Legacy batches (ownership not tracked per unit)",
             "items": [batch_item(b, db, legacy_owner_unknown=True) for b in legacy_batches]},
        ],
    }


@router.get("/pharmacy")
def pharmacy_dashboard(db: Session = Depends(get_db),
                       user=Depends(require_role(["pharmacy"]))):
    uid = user["user_id"]
    batches = handled_batches(db, uid)
    owned = owner_inventory(db, uid)
    owned_by_id = {item["batch"].id: item for item in owned}
    all_batches = {b.id: b for b in batches}
    all_batches.update({b_id: item["batch"] for b_id, item in owned_by_id.items()})
    legacy_batches = [b for b in batches if b.id not in owned_by_id and
                      not batch_inventories(db, [b])[b.id]["serialized"]]
    soon = date.today() + timedelta(days=90)
    expiring = [b for b in all_batches.values() if b.expiry_date <= soon]

    sales = (db.query(Transaction, MedicineBatch)
             .join(MedicineBatch, MedicineBatch.id == Transaction.batch_id)
             .filter(Transaction.seller_id == uid)
             .order_by(Transaction.id.desc()).limit(20).all())
    units_sold = (db.query(func.coalesce(func.sum(Transaction.quantity), 0))
                  .filter(Transaction.seller_id == uid).scalar())

    days = [date.today() - timedelta(days=i) for i in range(6, -1, -1)]
    per_day = {d: 0 for d in days}
    recent = (db.query(Transaction)
              .filter(Transaction.seller_id == uid,
                      Transaction.transaction_date >= datetime.combine(days[0], datetime.min.time()))
              .all())
    for t in recent:
        if t.transaction_date:
            d = t.transaction_date.date()
            if d in per_day:
                per_day[d] += t.quantity

    return {
        "summary": {
            "Batches in stock list": len(all_batches),
            "Serialized units held": sum(item["held"] for item in owned),
            "Serialized units available": sum(item["available"] for item in owned),
            "Units I sold": int(units_sold),
            "Expiring within 90 days": len(expiring),
        },
        "charts": [{"title": "Units sold, last 7 days",
                    "data": [{"label": d.strftime("%a %d"), "value": v} for d, v in per_day.items()]}],
        "sections": [
            {"title": "Expiry alerts", "items": [batch_item(b, db, b.id not in owned_by_id) for b in expiring]},
            {"title": "Serialized inventory", "items": [unit_inventory_item(item) for item in owned]},
            {"title": "Legacy batches (ownership not tracked per unit)",
             "items": [batch_item(b, db, legacy_owner_unknown=True) for b in legacy_batches]},
            {"title": "Recent sales", "items": [
                {
                    "title": f"{b.drug_name} × {t.quantity}",
                    "subtitle": t.transaction_date.strftime("%Y-%m-%d %H:%M") if t.transaction_date else "",
                    "tag": "sale",
                    "batch_uid": str(b.batch_uid),
                } for t, b in sales
            ]},
        ],
    }


@router.get("/admin")
def admin_dashboard(db: Session = Depends(get_db),
                    user=Depends(require_role(["admin"]))):
    batches = db.query(MedicineBatch).order_by(MedicineBatch.id.desc()).all()
    users_by_role = db.query(User.role, func.count(User.id)).group_by(User.role).all()

    tampered_items = []
    for b in batches:
        check = verify_chain(db, b.id)
        if not check["valid"]:
            item = batch_item(b, db)
            item["tag"] = "TAMPERED"
            item["subtitle"] = check["reason"]
            tampered_items.append(item)

    return {
        "summary": {
            "Users": sum(c for _, c in users_by_role),
            "Batches": len(batches),
            "Transactions": db.query(func.count(Transaction.id)).scalar(),
            "Tampered chains": len(tampered_items),
            "Expired batches": sum(1 for b in batches if b.expiry_date < date.today()),
        },
        "charts": [
            status_chart(batches),
            {"title": "Users by role", "data": [{"label": r, "value": c} for r, c in users_by_role]},
        ],
        "sections": [
            {"title": "Tampered batches", "items": tampered_items},
            {"title": "Users by role", "items": [
                {"title": role, "subtitle": f"{count} account(s)", "tag": "users"}
                for role, count in users_by_role
            ]},
            {"title": "All batches", "items": [batch_item(b, db) for b in batches]},
        ],
    }


@router.get("/customer")
def customer_dashboard(user=Depends(require_role(["customer"]))):
    return {"message": "TODO: customer scan history"}
