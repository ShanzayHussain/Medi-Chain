import random
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models import user, batch, custody_ledger, transaction, flag, temperature  # noqa: F401
from app.models.batch import MedicineBatch
from app.models.transaction import Transaction

random.seed(7)


def main():
    db = SessionLocal()
    try:
        now = datetime.now().replace(microsecond=0)
        added = 0
        for b in db.query(MedicineBatch).filter(MedicineBatch.status == "in_stock").all():
            first = (db.query(Transaction).filter(Transaction.batch_id == b.id)
                     .order_by(Transaction.id).first())
            if not first or not first.transaction_date:
                continue
            budget = int((b.quantity - (b.quantity_sold or 0)) * 0.5)
            if budget < 20:
                continue
            start = max(first.transaction_date, now - timedelta(days=56))
            span = max(1, (now - start).days)
            n = min(30, span)
            per = max(1, budget // n)
            total = 0
            for _ in range(n):
                qty = random.randint(max(1, per // 2), per)
                days_ago = int(span * random.random() ** 1.5)  # more sales in recent weeks
                ts = min(now, now - timedelta(days=days_ago, hours=random.randint(0, 10)))
                db.add(Transaction(batch_id=b.id, seller_id=first.seller_id,
                                   quantity=qty, transaction_date=ts))
                total += qty
                added += 1
            b.quantity_sold = (b.quantity_sold or 0) + total
        db.commit()
        print(f"Added {added} sales rows.")
    finally:
        db.close()


if __name__ == "__main__":
    main()