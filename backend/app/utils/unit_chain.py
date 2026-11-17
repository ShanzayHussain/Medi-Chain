from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.medicine_unit import MedicineUnit
from app.models.unit_movement import UnitMovementEvent
from app.models.user import User


def unit_supply_chain_summary(db: Session, batch_id: int):
    """Summarize per-unit manufacturer → distributor → pharmacy receipt records."""
    unit_ids = [row[0] for row in
                db.query(MedicineUnit.id).filter(MedicineUnit.batch_id == batch_id).all()]
    if not unit_ids:
        return None

    rows = (
        db.query(UnitMovementEvent.unit_id, UnitMovementEvent.event_type,
                 UnitMovementEvent.actor_id, User.role)
        .outerjoin(User, User.id == UnitMovementEvent.actor_id)
        .filter(UnitMovementEvent.unit_id.in_(unit_ids))
        .order_by(UnitMovementEvent.id.asc())
        .all()
    )
    per_unit = defaultdict(list)
    for unit_id, event_type, actor_id, role in rows:
        per_unit[unit_id].append((event_type, role))

    complete = 0
    distributor_received = 0
    pharmacy_received = 0
    for unit_id in unit_ids:
        events = per_unit[unit_id]
        positions = [
            next((i for i, (event, role) in enumerate(events)
                  if event == "created" and role == "manufacturer"), None),
            next((i for i, (event, role) in enumerate(events)
                  if event == "received" and role == "distributor"), None),
            next((i for i, (event, role) in enumerate(events)
                  if event == "received" and role == "pharmacy"), None),
        ]
        distributor_received += positions[1] is not None
        pharmacy_received += positions[2] is not None
        if all(position is not None for position in positions) and positions == sorted(positions):
            complete += 1

    total = len(unit_ids)
    return {
        "unit_count": total,
        "complete_units": complete,
        "incomplete_units": total - complete,
        "distributor_received_units": distributor_received,
        "pharmacy_received_units": pharmacy_received,
        "complete": complete == total,
    }
