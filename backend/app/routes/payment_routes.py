import os
import re
import secrets
import time
import uuid
from collections import defaultdict
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.batch import MedicineBatch
from app.models.custody_ledger import CustodyLedger
from app.models.order import Order
from app.models.transaction import Transaction
from app.models.user import User
from app.utils.coldchain import coldchain_summary
from app.utils.ledger import append_custody_event, verify_chain
from app.utils.sepolia import (
    HASH_RE, PHARMACY_WALLET, RATE, check_payment, pkr_to_wei, wei_to_eth_str,
)

router = APIRouter(prefix="/payments", tags=["payments"])

# Sandbox methods mark an order paid WITHOUT real money, so they only work while this is on.
SANDBOX = os.getenv("PAYMENTS_SANDBOX", "1") == "1"
SANDBOX_METHODS = ("card", "jazzcash", "easypaisa")


class OrderCreate(BaseModel):
    batch_uid: str
    quantity: int = Field(gt=0, le=1000)


class SandboxPay(BaseModel):
    method: str
    reference: str       # card: last 4 digits, wallets: mobile number (the full card number is never sent)


class CryptoVerify(BaseModel):
    tx_hash: str


def pick_seller(db: Session, batch):
    """The pharmacy that most recently received this batch."""
    row = (db.query(CustodyLedger)
           .filter(CustodyLedger.batch_id == batch.id,
                   CustodyLedger.actor_role == "pharmacy",
                   CustodyLedger.event_type == "TRANSFERRED")
           .order_by(CustodyLedger.id.desc()).first())
    if not row:
        raise HTTPException(status_code=400, detail="No pharmacy has received this batch yet, so it cannot be bought")
    return db.get(User, row.actor_id)


def summary(o, b, seller):
    wei = pkr_to_wei(o.total_pkr)
    return {
        "order_id": o.id, "drug": b.drug_name, "quantity": o.quantity,
        "unit_price_pkr": o.unit_price_pkr, "total_pkr": o.total_pkr,
        "seller": seller.organization_name or seller.name, "status": o.status,
        "crypto": {"amount_eth": wei_to_eth_str(wei), "amount_wei": str(wei), "wallet": PHARMACY_WALLET},
    }


def my_pending_order(db: Session, order_id: int, user_id: int):
    o = db.query(Order).filter(Order.id == order_id, Order.buyer_id == user_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.status != "pending":
        raise HTTPException(status_code=400, detail=f"This order is already {o.status}")
    return o


def settle(db: Session, order_id: int, buyer_id: int, method: str, ref=None, tx_hash=None):
    """Marks the order paid and runs the normal sale flow. Rows are locked so stock cannot be oversold."""
    o = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not o or o.buyer_id != buyer_id:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.status != "pending":
        raise HTTPException(status_code=400, detail=f"This order is already {o.status}")

    b = db.query(MedicineBatch).filter(MedicineBatch.id == o.batch_id).with_for_update().first()
    sold = b.quantity_sold or 0
    if o.quantity > b.quantity - sold:
        o.status, o.method, o.tx_hash = "failed", method, tx_hash
        o.failure_reason = "Stock ran out before the payment completed"
        db.commit()
        raise HTTPException(status_code=409, detail="Stock ran out before the payment completed. Ask the pharmacy for a refund.")

    seller = db.get(User, o.seller_id)
    db.add(Transaction(batch_id=b.id, seller_id=o.seller_id, buyer_id=o.buyer_id, quantity=o.quantity))
    b.quantity_sold = sold + o.quantity
    b.status = "sold_out" if b.quantity_sold >= b.quantity else "in_stock"
    o.status, o.method, o.payment_ref, o.tx_hash, o.paid_at = "paid", method, ref, tx_hash, datetime.now()
    db.commit()

    append_custody_event(
        db=db, batch_id=b.id, event_type="SOLD",
        actor_id=seller.id, actor_role=seller.role, location=f"Online sale ({method})",
    )
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

    # A medicine that fails verification cannot be bought
    if not verify_chain(db, b.id)["valid"]:
        raise HTTPException(status_code=400, detail="This batch failed verification and cannot be bought")
    if b.expiry_date < date.today():
        raise HTTPException(status_code=400, detail="This batch has expired")
    if coldchain_summary(db, b).get("status") == "breached":
        raise HTTPException(status_code=400, detail="This batch had a cold chain breach and cannot be sold")
    if not b.price_pkr:
        raise HTTPException(status_code=400, detail="This batch has no price set")
    if body.quantity > b.quantity - (b.quantity_sold or 0):
        raise HTTPException(status_code=400, detail="Not enough units left in this batch")

    seller = pick_seller(db, b)
    o = Order(batch_id=b.id, buyer_id=user["user_id"], seller_id=seller.id,
              quantity=body.quantity, unit_price_pkr=b.price_pkr,
              total_pkr=b.price_pkr * body.quantity, status="pending", created_ts=int(time.time()))
    db.add(o)
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
    if body.method == "card" and body.reference == "0002":
        raise HTTPException(status_code=402, detail="Card declined (sandbox: cards ending in 0002 always decline)")

    my_pending_order(db, order_id, user["user_id"])
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
