import os
import re
import secrets
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.batch import MedicineBatch
from app.models.custody_ledger import CustodyLedger
from app.models.order import Order
from app.models.medicine_unit import MedicineUnit
from app.models.transaction import Transaction
from app.models.unit_movement import UnitMovementEvent
from app.models.user import User
from app.utils.coldchain import coldchain_summary
from app.utils.ledger import append_custody_event, verify_chain
from app.utils.inventory import batch_inventories, sync_batch_unit_owner
from app.utils.sepolia import (
    HASH_RE, PHARMACY_WALLET, RATE, check_payment, pkr_to_wei, wei_to_eth_str,
)

router = APIRouter(prefix="/payments", tags=["payments"])

# Sandbox methods mark an order paid WITHOUT real money, so they only work while this is on.
SANDBOX = os.getenv("PAYMENTS_SANDBOX", "1") == "1"
SANDBOX_METHODS = ("card", "jazzcash", "easypaisa")
UNIT_RESERVATION_MINUTES = 30


class OrderCreate(BaseModel):
    batch_uid: str
    quantity: int = Field(gt=0, le=1000)
    seller_id: int | None = Field(default=None, gt=0)


class SandboxPay(BaseModel):
    method: str
    reference: str       # card: last 4 digits, wallets: mobile number (the full card number is never sent)


class CryptoVerify(BaseModel):
    tx_hash: str


def pick_seller(db: Session, batch, seller_id=None):
    """The pharmacy that most recently received this batch."""
    sync_batch_unit_owner(db, batch.id)
    inventory = batch_inventories(db, [batch])[batch.id]
    if inventory["serialized"]:
        q = (db.query(MedicineUnit.current_owner_id, func.count(MedicineUnit.id))
             .join(User, User.id == MedicineUnit.current_owner_id)
             .filter(MedicineUnit.batch_id == batch.id,
                     MedicineUnit.status == "available",
                     User.role == "pharmacy"))
        if seller_id is not None:
            q = q.filter(MedicineUnit.current_owner_id == seller_id)
        sellers = q.group_by(MedicineUnit.current_owner_id).all()
        if not sellers:
            raise HTTPException(status_code=400, detail="No pharmacy has serialized units available")
        if seller_id is None and len(sellers) > 1:
            raise HTTPException(status_code=400, detail="Choose a pharmacy from the marketplace listing")
        chosen_id = sellers[0][0]
        return db.get(User, chosen_id)

    row = (db.query(CustodyLedger)
           .filter(CustodyLedger.batch_id == batch.id,
                   CustodyLedger.actor_role == "pharmacy",
                   CustodyLedger.event_type == "TRANSFERRED")
           .order_by(CustodyLedger.id.desc()).first())
    if not row:
        raise HTTPException(status_code=400, detail="No pharmacy has received this batch yet, so it cannot be bought")
    if seller_id is not None and seller_id != row.actor_id:
        raise HTTPException(status_code=400, detail="That pharmacy is not the seller for this legacy batch")
    return db.get(User, row.actor_id)


def summary(o, b, seller):
    wei = pkr_to_wei(o.total_pkr)
    return {
        "order_id": o.id, "drug": b.drug_name, "quantity": o.quantity,
        "unit_price_pkr": o.unit_price_pkr, "total_pkr": o.total_pkr,
        "seller": seller.organization_name or seller.name, "status": o.status,
        "seller_id": seller.id,
        "crypto": {"amount_eth": wei_to_eth_str(wei), "amount_wei": str(wei), "wallet": PHARMACY_WALLET},
    }


def my_pending_order(db: Session, order_id: int, user_id: int):
    o = db.query(Order).filter(Order.id == order_id, Order.buyer_id == user_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.status != "pending":
        raise HTTPException(status_code=400, detail=f"This order is already {o.status}")
    return o


def reservation_expired(value):
    if value is None:
        return True
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value <= datetime.now(timezone.utc)


def release_expired_reservations(db: Session, batch_id=None):
    now = datetime.now(timezone.utc)
    q = (db.query(MedicineUnit.reserved_order_id)
         .filter(MedicineUnit.status == "reserved", MedicineUnit.reserved_until <= now))
    if batch_id is not None:
        q = q.filter(MedicineUnit.batch_id == batch_id)
    order_ids = sorted({row[0] for row in q.distinct().all() if row[0] is not None})
    if not order_ids:
        return
    orders = (db.query(Order).filter(Order.id.in_(order_ids), Order.status == "pending")
              .order_by(Order.id).with_for_update().all())
    active_ids = {order.id for order in orders}
    if not active_ids:
        return
    units = (db.query(MedicineUnit)
             .filter(MedicineUnit.reserved_order_id.in_(active_ids),
                     MedicineUnit.status == "reserved", MedicineUnit.reserved_until <= now)
             .order_by(MedicineUnit.id).with_for_update().all())
    for unit in units:
        unit.status = "available"
        unit.reserved_order_id = None
        unit.reserved_until = None
    for order in orders:
        order.status = "expired"
        order.failure_reason = "The unit reservation expired before payment completed"


def fail_order_reservations(db: Session, order: Order, reason: str):
    order = db.query(Order).filter(Order.id == order.id).with_for_update().first()
    if not order or order.status != "pending":
        raise HTTPException(status_code=400, detail="This order is no longer pending")
    units = (db.query(MedicineUnit).filter(MedicineUnit.reserved_order_id == order.id)
             .order_by(MedicineUnit.id).with_for_update().all())
    for unit in units:
        unit.status = "available"
        unit.reserved_order_id = None
        unit.reserved_until = None
    order.status = "failed"
    order.failure_reason = reason
    db.commit()


def settle(db: Session, order_id: int, buyer_id: int, method: str, ref=None, tx_hash=None):
    """Marks the order paid and runs the normal sale flow. Rows are locked so stock cannot be oversold."""
    o = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not o or o.buyer_id != buyer_id:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.status != "pending":
        raise HTTPException(status_code=400, detail=f"This order is already {o.status}")

    b = db.query(MedicineBatch).filter(MedicineBatch.id == o.batch_id).with_for_update().first()
    inventory = batch_inventories(db, [b])[b.id]
    seller = db.get(User, o.seller_id)
    sold_units = []
    if inventory["serialized"]:
        sold_units = (db.query(MedicineUnit)
                      .filter(MedicineUnit.reserved_order_id == o.id,
                              MedicineUnit.status == "reserved")
                      .order_by(MedicineUnit.id).with_for_update().all())
        expired = any(reservation_expired(unit.reserved_until) for unit in sold_units)
        if len(sold_units) != o.quantity or expired or any(
            unit.current_owner_id != seller.id for unit in sold_units
        ):
            for unit in sold_units:
                unit.status = "available"
                unit.reserved_order_id = None
                unit.reserved_until = None
            o.status = "expired" if expired else "failed"
            o.method, o.tx_hash = method, tx_hash
            o.failure_reason = "Reserved units were unavailable at settlement"
            db.commit()
            raise HTTPException(status_code=409, detail="The reserved units are no longer available. If payment was taken, contact the pharmacy for a refund.")
        sold = inventory["sold"]
    else:
        sold = b.quantity_sold or 0
        if o.quantity > b.quantity - sold:
            o.status, o.method, o.tx_hash = "failed", method, tx_hash
            o.failure_reason = "Stock ran out before the payment completed"
            db.commit()
            raise HTTPException(status_code=409, detail="Stock ran out before the payment completed. Ask the pharmacy for a refund.")

    db.add(Transaction(batch_id=b.id, seller_id=o.seller_id, buyer_id=o.buyer_id, quantity=o.quantity))
    b.quantity_sold = sold + o.quantity
    b.status = "sold_out" if b.quantity_sold >= b.quantity else "in_stock"
    o.status, o.method, o.payment_ref, o.tx_hash, o.paid_at = "paid", method, ref, tx_hash, datetime.now()
    for unit in sold_units:
        previous_owner_id = unit.current_owner_id
        unit.status = "sold"
        unit.current_owner_id = o.buyer_id
        unit.reserved_order_id = None
        unit.reserved_until = None
        db.add(UnitMovementEvent(
            unit_id=unit.id,
            order_id=o.id,
            event_type="sold",
            actor_id=seller.id,
            from_owner_id=previous_owner_id,
            to_owner_id=o.buyer_id,
            location=f"Online sale ({method})",
        ))

    append_custody_event(
        db=db, batch_id=b.id, event_type="SOLD",
        actor_id=seller.id, actor_role=seller.role, location=f"Online sale ({method})",
        commit=False,
    )
    db.commit()
    return {
        "paid": True, "order_id": o.id, "method": method, "payment_ref": ref or tx_hash,
        "total_pkr": o.total_pkr, "units_remaining": b.quantity - (b.quantity_sold or 0),
    }


@router.get("/config")
def config(user=Depends(get_current_user)):
    return {
        "role": user["role"],
        "can_buy": user["role"] == "customer",
        "sandbox": SANDBOX,
        "crypto": {"enabled": bool(PHARMACY_WALLET), "network": "Sepolia testnet",
                   "chain_id": 11155111, "pkr_per_eth": RATE},
    }


@router.post("/orders")
def create_order(body: OrderCreate, db: Session = Depends(get_db),
                 user=Depends(require_role(["customer"]))):
    try:
        uid = uuid.UUID(body.batch_uid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid batch ID")
    b = db.query(MedicineBatch).filter(MedicineBatch.batch_uid == uid).first()
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")

    release_expired_reservations(db, b.id)

    # A medicine that fails verification cannot be bought
    if not verify_chain(db, b.id)["valid"]:
        raise HTTPException(status_code=400, detail="This batch failed verification and cannot be bought")
    if b.expiry_date < date.today():
        raise HTTPException(status_code=400, detail="This batch has expired")
    if coldchain_summary(db, b).get("status") == "breached":
        raise HTTPException(status_code=400, detail="This batch had a cold chain breach and cannot be sold")
    if not b.price_pkr:
        raise HTTPException(status_code=400, detail="This batch has no price set")
    inventory = batch_inventories(db, [b])[b.id]
    if not inventory["serialized"] and body.quantity > b.quantity - (b.quantity_sold or 0):
        raise HTTPException(status_code=400, detail="Not enough units left in this batch")

    seller = pick_seller(db, b, body.seller_id)
    o = Order(batch_id=b.id, buyer_id=user["user_id"], seller_id=seller.id,
              quantity=body.quantity, unit_price_pkr=b.price_pkr,
              total_pkr=b.price_pkr * body.quantity, status="pending", created_ts=int(time.time()))
    db.add(o)
    db.flush()
    if inventory["serialized"]:
        reserved_units = (
            db.query(MedicineUnit)
            .filter(MedicineUnit.batch_id == b.id,
                    MedicineUnit.current_owner_id == seller.id,
                    MedicineUnit.status == "available")
            .order_by(MedicineUnit.id)
            .limit(body.quantity)
            .with_for_update(skip_locked=True)
            .all()
        )
        if len(reserved_units) != body.quantity:
            db.rollback()
            raise HTTPException(status_code=409, detail="Not enough units are available at this pharmacy")
        reserved_until = datetime.now(timezone.utc) + timedelta(minutes=UNIT_RESERVATION_MINUTES)
        for unit in reserved_units:
            unit.status = "reserved"
            unit.reserved_order_id = o.id
            unit.reserved_until = reserved_until
    db.commit()
    db.refresh(o)
    return summary(o, b, seller)


@router.post("/orders/{order_id}/pay-sandbox")
def pay_sandbox(order_id: int, body: SandboxPay, db: Session = Depends(get_db),
                user=Depends(require_role(["customer"]))):
    if not SANDBOX:
        raise HTTPException(status_code=403, detail="Sandbox payments are disabled")
    if body.method not in SANDBOX_METHODS:
        raise HTTPException(status_code=400, detail="Unknown payment method")
    if body.method == "card" and not re.fullmatch(r"\d{4}", body.reference):
        raise HTTPException(status_code=400, detail="Invalid card")
    if body.method != "card" and not re.fullmatch(r"03\d{9}", body.reference):
        raise HTTPException(status_code=400, detail="Enter a valid mobile number, e.g. 03001234567")
    order = my_pending_order(db, order_id, user["user_id"])
    if body.method == "card" and body.reference == "0002":
        fail_order_reservations(db, order, "Sandbox payment declined")
        raise HTTPException(status_code=402, detail="Card declined (sandbox: cards ending in 0002 always decline)")
    ref = f"SBX-{body.method[:2].upper()}-{secrets.token_hex(4).upper()}"
    return settle(db, order_id, user["user_id"], body.method, ref=ref)


@router.post("/orders/{order_id}/verify-crypto")
def verify_crypto(order_id: int, body: CryptoVerify, db: Session = Depends(get_db),
                  user=Depends(require_role(["customer"]))):
    if not PHARMACY_WALLET:
        raise HTTPException(status_code=503, detail="Crypto payments are not configured (PHARMACY_WALLET is empty)")
    h = body.tx_hash.strip().lower()
    if not HASH_RE.match(h):
        raise HTTPException(status_code=400, detail="That is not a valid transaction hash (0x followed by 64 characters)")

    o = my_pending_order(db, order_id, user["user_id"])
    if db.query(Order).filter(Order.tx_hash == h, Order.id != o.id).first():
        raise HTTPException(status_code=400, detail="This transaction was already used for another order")

    try:
        state, msg = check_payment(h, PHARMACY_WALLET, pkr_to_wei(o.total_pkr), o.created_ts)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)[:200])
    if state == "pending":
        return {"paid": False, "message": msg}
    if state == "bad":
        raise HTTPException(status_code=400, detail=msg)

    try:
        return settle(db, order_id, user["user_id"], "crypto", tx_hash=h)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="This transaction was already used for another order")


@router.get("/orders")
def list_orders(db: Session = Depends(get_db),
                user=Depends(require_role(["customer", "pharmacy", "admin"]))):
    q = db.query(Order, MedicineBatch).join(MedicineBatch, MedicineBatch.id == Order.batch_id)
    if user["role"] == "customer":
        q = q.filter(Order.buyer_id == user["user_id"])
    elif user["role"] == "pharmacy":
        q = q.filter(Order.seller_id == user["user_id"])
    rows = q.order_by(Order.id.desc()).limit(100).all()

    paid = [o for o, _ in rows if o.status == "paid"]
    by_method = defaultdict(int)
    for o in paid:
        by_method[o.method] += o.total_pkr
    total = sum(o.total_pkr for o in paid)

    return {
        "summary": {
            "Total spent (PKR)" if user["role"] == "customer" else "Revenue (PKR)": total,
            "Paid orders": len(paid),
            "Pending / failed": len(rows) - len(paid),
        },
        "charts": [{"title": "Amount by payment method (PKR)",
                    "data": [{"label": m, "value": v} for m, v in by_method.items()]}],
        "sections": [{"title": "Orders", "items": [
            {
                "title": f"{b.drug_name} × {o.quantity}",
                "subtitle": f"PKR {o.total_pkr} • {o.method or 'not paid'} • "
                            f"{o.created_at.strftime('%Y-%m-%d %H:%M') if o.created_at else ''}",
                "tag": o.status,
                "batch_uid": str(b.batch_uid),
            } for o, b in rows
        ]}],
    }


CATEGORIES = [
    ("Pain Relief", ("panadol", "disprin", "brufen", "calpol", "arinac", "paracetamol", "ibuprofen")),
    ("Antibiotics", ("augmentin", "amoxil", "flagyl", "amoxicillin")),
    ("Diabetes", ("insulin", "glucophage")),
    ("Respiratory", ("ventolin",)),
    ("Stomach", ("risek",)),
    ("Allergy", ("cetirizine",)),
]


def category_of(name: str) -> str:
    n = name.lower()
    for cat, words in CATEGORIES:
        if any(w in n for w in words):
            return cat
    return "Other"


@router.get("/market")
def market(db: Session = Depends(get_db), user=Depends(require_role(["customer"]))):
    release_expired_reservations(db)
    db.commit()
    batches = (db.query(MedicineBatch)
               .filter(MedicineBatch.price_pkr > 0, MedicineBatch.expiry_date >= date.today())
               .order_by(MedicineBatch.id.desc()).limit(100).all())
    if not batches:
        return {"categories": [], "items": []}

    inventories = batch_inventories(db, batches)

    # Legacy batches retain the batch-ledger seller. Serialized batches derive
    # each listing and available count from units owned by an individual pharmacy.
    legacy_batch_ids = [b.id for b in batches if not inventories[b.id]["serialized"]]
    sellers = {}
    rows = (db.query(CustodyLedger)
            .filter(CustodyLedger.batch_id.in_(legacy_batch_ids or [-1]),
                    CustodyLedger.actor_role == "pharmacy",
                    CustodyLedger.event_type == "TRANSFERRED")
            .order_by(CustodyLedger.id.asc()).all())
    for r in rows:
        sellers[r.batch_id] = r.actor_id

    unit_sellers = {}
    serialized_batch_ids = [b.id for b in batches if inventories[b.id]["serialized"]]
    unit_rows = (
        db.query(MedicineUnit.batch_id, MedicineUnit.current_owner_id, func.count(MedicineUnit.id))
        .join(User, User.id == MedicineUnit.current_owner_id)
        .filter(MedicineUnit.batch_id.in_(serialized_batch_ids or [-1]),
                MedicineUnit.status == "available", User.role == "pharmacy")
        .group_by(MedicineUnit.batch_id, MedicineUnit.current_owner_id)
        .all()
    )
    for batch_id, seller_id, count in unit_rows:
        unit_sellers.setdefault(batch_id, []).append((seller_id, int(count)))
    seller_ids = set(sellers.values()) | {
        seller_id for rows in unit_sellers.values() for seller_id, _ in rows
    }
    users = {u.id: (u.organization_name or u.name)
             for u in db.query(User).filter(User.id.in_(seller_ids or {0})).all()}

    items = []
    for b in batches:
        if not verify_chain(db, b.id)["valid"]:
            continue
        if coldchain_summary(db, b).get("status") == "breached":
            continue
        if inventories[b.id]["serialized"]:
            for seller_id, count in unit_sellers.get(b.id, []):
                items.append({
                    "batch_uid": str(b.batch_uid), "seller_id": seller_id,
                    "drug": b.drug_name, "price_pkr": b.price_pkr,
                    "remaining": count, "expiry": b.expiry_date.isoformat(),
                    "seller": users.get(seller_id, "Pharmacy"),
                    "category": category_of(b.drug_name),
                    "cold_chain": bool(b.requires_cold_chain),
                })
        elif b.id in sellers and inventories[b.id]["remaining"] > 0:
            seller_id = sellers[b.id]
            items.append({
                "batch_uid": str(b.batch_uid), "seller_id": seller_id,
                "drug": b.drug_name, "price_pkr": b.price_pkr,
                "remaining": inventories[b.id]["remaining"], "expiry": b.expiry_date.isoformat(),
                "seller": users.get(seller_id, "Pharmacy"), "category": category_of(b.drug_name),
                "cold_chain": bool(b.requires_cold_chain),
            })
    return {"categories": sorted({i["category"] for i in items}), "items": items}
