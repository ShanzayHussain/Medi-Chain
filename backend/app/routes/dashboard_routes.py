from datetime import date, timedelta
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

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def batch_item(b):
    sold = b.quantity_sold or 0
    tag = "expired" if b.expiry_date < date.today() else b.status
    return {
        "title": b.drug_name,
        "subtitle": f"{b.quantity - sold} of {b.quantity} units left • expires {b.expiry_date.isoformat()}",
        "tag": tag,
        "batch_uid": str(b.batch_uid),
    }


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
    tampered = sum(1 for b in batches if not verify_chain(db, b.id)["valid"])
    return {
        "summary": {
            "Total batches": len(batches),
            "Units produced": sum(b.quantity or 0 for b in batches),
            "Units sold": sum(b.quantity_sold or 0 for b in batches),
            "Expired batches": sum(1 for b in batches if b.expiry_date < date.today()),
            "Tampered chains": tampered,
        },
        "sections": [{"title": "My batches", "items": [batch_item(b) for b in batches]}],
    }


@router.get("/distributor")
def distributor_dashboard(db: Session = Depends(get_db),
                          user=Depends(require_role(["distributor"]))):
    batches = handled_batches(db, user["user_id"])
    return {
        "summary": {
            "Batches handled": len(batches),
            "Expired batches": sum(1 for b in batches if b.expiry_date < date.today()),
        },
        "sections": [{"title": "Batches I have handled", "items": [batch_item(b) for b in batches]}],
    }


@router.get("/pharmacy")
def pharmacy_dashboard(db: Session = Depends(get_db),
                       user=Depends(require_role(["pharmacy"]))):
    uid = user["user_id"]
    batches = handled_batches(db, uid)
    soon = date.today() + timedelta(days=90)
    expiring = [b for b in batches if b.expiry_date <= soon]

    sales = (db.query(Transaction, MedicineBatch)
             .join(MedicineBatch, MedicineBatch.id == Transaction.batch_id)
             .filter(Transaction.seller_id == uid)
             .order_by(Transaction.id.desc()).limit(20).all())
    units_sold = (db.query(func.coalesce(func.sum(Transaction.quantity), 0))
                  .filter(Transaction.seller_id == uid).scalar())

    return {
        "summary": {
            "Batches in stock list": len(batches),
            "Units I sold": int(units_sold),
            "Expiring within 90 days": len(expiring),
        },
        "sections": [
            {"title": "Expiry alerts", "items": [batch_item(b) for b in expiring]},
            {"title": "My batches", "items": [batch_item(b) for b in batches]},
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
            item = batch_item(b)
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
        "sections": [
            {"title": "Tampered batches", "items": tampered_items},
            {"title": "Users by role", "items": [
                {"title": role, "subtitle": f"{count} account(s)", "tag": "users"}
                for role, count in users_by_role
            ]},
            {"title": "All batches", "items": [batch_item(b) for b in batches]},
        ],
    }


@router.get("/customer")
def customer_dashboard(user=Depends(require_role(["customer"]))):
    return {"message": "TODO: customer scan history"}