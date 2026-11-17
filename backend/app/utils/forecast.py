import statistics
from collections import defaultdict
from datetime import date, timedelta
from sqlalchemy.orm import Session
from app.models.batch import MedicineBatch
from app.models.transaction import Transaction
from app.utils.inventory import batch_inventories

WEEKS = 8


def linear_forecast(ys):
    """Least-squares trend line over weekly totals; returns (next week's value, slope)."""
    n = len(ys)
    mx, my = (n - 1) / 2, sum(ys) / n
    den = sum((x - mx) ** 2 for x in range(n))
    slope = sum((x - mx) * (y - my) for x, y in zip(range(n), ys)) / den if den else 0
    return max(0.0, my + slope * (n - mx)), slope


def forecast_demand(db: Session):
    today = date.today()
    start = today - timedelta(days=WEEKS * 7 - 1)

    sales = defaultdict(lambda: [0] * WEEKS)
    rows = (db.query(MedicineBatch.drug_name, Transaction.transaction_date, Transaction.quantity)
            .join(MedicineBatch, MedicineBatch.id == Transaction.batch_id)
            .filter(Transaction.transaction_date >= start).all())
    for drug, ts, qty in rows:
        idx = (ts.date() - start).days // 7
        if 0 <= idx < WEEKS:
            sales[drug][idx] += qty

    stock = defaultdict(int)
    active_batches = db.query(MedicineBatch).filter(MedicineBatch.expiry_date >= today).all()
    inventories = batch_inventories(db, active_batches)
    for batch in active_batches:
        inventory = inventories[batch.id]
        stock[batch.drug_name] += inventory["forecast_stock"]

    out = []
    for drug in set(stock) | set(sales):
        w = sales[drug] if drug in sales else [0] * WEEKS
        nxt, slope = linear_forecast(w)
        avg_daily = sum(w[-4:]) / 28
        left = stock.get(drug, 0)
        days_left = round(left / avg_daily) if avg_daily > 0 else None

        prev = w[:-1]
        spike = w[-1] > 0 and w[-1] > statistics.mean(prev) + 2 * statistics.pstdev(prev)

        if days_left is None:
            status = "no_sales"
        elif days_left < 14:
            status = "shortage"
        elif days_left < 30:
            status = "low"
        else:
            status = "ok"

        out.append({
            "drug": drug, "next_week": round(nxt), "stock": left, "days_left": days_left,
            "trend": "rising" if slope > 0.5 else "falling" if slope < -0.5 else "steady",
            "spike": spike, "status": status,
        })
    out.sort(key=lambda r: (r["days_left"] is None, r["days_left"] or 0))
    return out
