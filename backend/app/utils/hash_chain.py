import hashlib
import json
from datetime import datetime

GENESIS_HASH = "0" * 64

def compute_hash(record: dict, previous_hash: str) -> str:
    """
    Takes a record's fields + the previous entry's hash,
    returns a SHA-256 hex digest that becomes this entry's fingerprint.
    """
    payload = json.dumps(record, sort_keys=True, default=str) + previous_hash
    return hashlib.sha256(payload.encode()).hexdigest()


def build_record_fields(batch_id: int, event_type: str, actor_id: int,
                          actor_role: str, location: str, timestamp: datetime) -> dict:
    """
    The exact fields that go into the hash. Must be reproducible later
    during verification — so keep this identical every time it's called.
    """
    return {
        "batch_id": batch_id,
        "event_type": event_type,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "location": location,
        "timestamp": timestamp.isoformat() if timestamp else None,
    }