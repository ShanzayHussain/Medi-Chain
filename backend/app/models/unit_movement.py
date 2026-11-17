from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class UnitMovementEvent(Base):
    __tablename__ = "unit_movement_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('created', 'transfer_requested', 'received', 'sold', 'scanned', "
            "'flagged', 'quarantined', 'released')",
            name="ck_unit_movement_events_event_type",
        ),
        Index("ix_unit_movement_events_unit_id_id", "unit_id", "id"),
        Index("ix_unit_movement_events_transfer_operation_id", "transfer_operation_id"),
        Index("ix_unit_movement_events_order_id", "order_id"),
    )

    id = Column(Integer, primary_key=True)
    unit_id = Column(Integer, ForeignKey("medicine_units.id", ondelete="RESTRICT"), nullable=False)
    transfer_operation_id = Column(
        Integer, ForeignKey("unit_transfer_operations.id", ondelete="RESTRICT"), nullable=True,
    )
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="RESTRICT"), nullable=True)
    event_type = Column(String(24), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    from_owner_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    to_owner_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    location = Column(String(100), nullable=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
