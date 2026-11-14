import random
from datetime import datetime, timedelta, date

from app.database import SessionLocal
from app.models import user, batch, custody_ledger, transaction  # noqa: F401
from app.models.user import User
from app.models.batch import MedicineBatch
from app.models.custody_ledger import CustodyLedger
from app.models.transaction import Transaction
from app.auth.security import hash_password
from app.utils.hash_chain import compute_hash, build_record_fields, GENESIS_HASH
from app.utils.ledger import get_last_ledger_entry

random.seed(42)  # same data every run
PASSWORD = "Test1234"

DRUGS = [
    "Panadol 500mg", "Brufen 400mg", "Augmentin 625mg", "Flagyl 400mg",
    "Ventolin Inhaler", "Insulin Mixtard", "Amoxil 500mg", "Disprin 300mg",
    "Calpol Syrup", "Risek 40mg", "Arinac Forte", "Glucophage 500mg",
]
HUBS = ["Karachi Hub", "Lahore Depot", "Islamabad Warehouse", "Hyderabad Hub"]
SHOPS = ["Clifton Pharmacy", "Gulshan Pharmacy", "DHA Medical Store", "Saddar Chemist"]

USERS = [
    ("manufacturer", "Getz Pharma", "manu1"),
    ("manufacturer", "Sami Pharmaceuticals", "manu2"),
    ("distributor", "Fast Distribution Co", "dist1"),
    ("distributor", "Medline Logistics", "dist2"),
    ("pharmacy", "Clifton Pharmacy", "pharm1"),
    ("pharmacy", "Gulshan Pharmacy", "pharm2"),
    ("pharmacy", "DHA Medical Store", "pharm3"),
    ("customer", None, "cust1"),
    ("customer", None, "cust2"),
    ("admin", "MediChain", "admin"),
]

# how many batches of each kind
SCENARIOS = (
    ["sold_partial"] * 6 + ["sold_out"] * 2 + ["in_transit"] * 4
    + ["created"] * 2 + ["expired"] * 2 + ["tampered"] * 3
)


def split(total, parts):
    parts = max(1, min(parts, total))
    if parts == 1:
        return [total]
    cuts = sorted(random.sample(range(1, total), parts - 1))
    return [b - a for a, b in zip([0] + cuts, cuts + [total])]


def add_event(db, b, event_type, actor, location, ts):
    last = get_last_ledger_entry(db, b.id)
    prev = last.current_hash if last else GENESIS_HASH
    e = CustodyLedger(
        batch_id=b.id, event_type=event_type, actor_id=actor.id,
        actor_role=actor.role, location=location, timestamp=ts,
        previous_hash=prev,
    )
    db.add(e)
    db.flush()
    e.current_hash = compute_hash(
        build_record_fields(b.id, event_type, actor.id, actor.role, location, ts), prev
    )
    db.flush()
    return e


def main():
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == "manu1@medichain.com").first():
            print("Seed data already exists, nothing to do.")
            return

        pw_hash = hash_password(PASSWORD)
        people = {}
        for role, org, handle in USERS:
            u = User(name=handle, email=f"{handle}@medichain.com", password_hash=pw_hash,
                     role=role, organization_name=org)
            db.add(u)
            people.setdefault(role, []).append(u)
        db.flush()

        now = datetime.now().replace(microsecond=0)
        today = date.today()
        tampered_targets = []

        for kind in SCENARIOS:
            manu = random.choice(people["manufacturer"])
            dist = random.choice(people["distributor"])
            pharm = random.choice(people["pharmacy"])
            qty = random.choice([200, 500, 1000, 2000, 5000])

            if kind == "expired":
                mfg = today - timedelta(days=800)
            else:
                mfg = today - timedelta(days=random.randint(45, 300))
            exp = mfg + timedelta(days=730)

            b = MedicineBatch(
                drug_name=random.choice(DRUGS), manufacturer_id=manu.id, quantity=qty,
                manufacture_date=mfg, expiry_date=exp, status="created", quantity_sold=0,
            )
            db.add(b)
            db.flush()

            ts = datetime.combine(mfg, datetime.min.time()) + timedelta(hours=9)
            step = lambda t: min(now, t + timedelta(days=random.randint(1, 4), hours=random.randint(0, 6)))

            entries = [add_event(db, b, "CREATED", manu, "Manufacturer facility", ts)]
            if kind == "created":
                db.flush()
                continue

            ts = step(ts)
            entries.append(add_event(db, b, "TRANSFERRED", dist, random.choice(HUBS), ts))
            b.status = "in_transit"
            if kind == "in_transit":
                continue

            ts = step(ts)
            entries.append(add_event(db, b, "TRANSFERRED", pharm, random.choice(SHOPS), ts))

            if kind == "sold_out":
                amounts = split(qty, random.randint(2, 3))
            else:
                amounts = split(int(qty * random.uniform(0.3, 0.7)), random.randint(2, 4))

            for amt in amounts:
                ts = step(ts)
                add_event(db, b, "SOLD", pharm, pharm.organization_name, ts)
                db.add(Transaction(batch_id=b.id, seller_id=pharm.id, quantity=amt,
                                   transaction_date=ts))
                b.quantity_sold += amt
            b.status = "sold_out" if b.quantity_sold >= qty else "in_stock"

            if kind == "tampered":
                tampered_targets.append(entries[1].id)

        db.commit()

        # tamper AFTER commit: change data but leave the stored hash untouched
        for ledger_id in tampered_targets:
            db.query(CustodyLedger).filter(CustodyLedger.id == ledger_id).update(
                {"location": "Unknown warehouse"}
            )
        db.commit()

        print(f"Seeded {len(USERS)} users and {len(SCENARIOS)} batches "
              f"({len(tampered_targets)} tampered).")
        print(f"All seed accounts use password: {PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()