from sqlalchemy.orm import Session
from app.models.custody_ledger import CustodyLedger
from app.utils.hash_chain import compute_hash, build_record_fields, GENESIS_HASH


def get_last_ledger_entry(db: Session, batch_id: int):
    return (
        db.query(CustodyLedger)
        .filter(CustodyLedger.batch_id == batch_id)
        .order_by(CustodyLedger.id.desc())
        .first()
    )


def append_custody_event(db: Session, batch_id: int, event_type: str,
                          actor_id: int, actor_role: str, location: str):
    last_entry = get_last_ledger_entry(db, batch_id)
    previous_hash = last_entry.current_hash if last_entry else GENESIS_HASH

    new_entry = CustodyLedger(
        batch_id=batch_id,
        event_type=event_type,
        actor_id=actor_id,
        actor_role=actor_role,
        location=location,
        previous_hash=previous_hash,
    )
    db.add(new_entry)
    db.flush()          # assigns new_entry.timestamp via server_default without full commit yet
    db.refresh(new_entry)

    record = build_record_fields(
        batch_id=new_entry.batch_id,
        event_type=new_entry.event_type,
        actor_id=new_entry.actor_id,
        actor_role=new_entry.actor_role,
        location=new_entry.location,
        timestamp=new_entry.timestamp,
    )
    new_entry.current_hash = compute_hash(record, previous_hash)

    db.commit()
    db.refresh(new_entry)
    return new_entry


def verify_chain(db: Session, batch_id: int) -> dict:
    entries = (
        db.query(CustodyLedger)
        .filter(CustodyLedger.batch_id == batch_id)
        .order_by(CustodyLedger.id.asc())
        .all()
    )

    if not entries:
        return {"valid": False, "reason": "No custody records found for this batch"}

    prev_hash = GENESIS_HASH
    for entry in entries:
        record = build_record_fields(
            batch_id=entry.batch_id,
            event_type=entry.event_type,
            actor_id=entry.actor_id,
            actor_role=entry.actor_role,
            location=entry.location,
            timestamp=entry.timestamp,
        )
        recomputed = compute_hash(record, prev_hash)

        if entry.previous_hash != prev_hash or recomputed != entry.current_hash:
            return {
                "valid": False,
                "reason": f"Chain broken at ledger entry id={entry.id}",
                "entries": len(entries),
            }
        prev_hash = entry.current_hash

    return {"valid": True, "reason": "Chain intact", "entries": len(entries)}