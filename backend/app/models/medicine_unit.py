import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base


class MedicineUnit(Base):
    __tablename__ = "medicine_units"
    __table_args__ = (
        CheckConstraint(
            "status IN ('available', 'pending_transfer', 'reserved', 'sold', 'quarantined')",
            name="ck_medicine_units_status",
        ),
        CheckConstraint(
            "reserved_order_id IS NULL OR pending_transfer_id IS NULL",
            name="ck_medicine_units_single_pending_operation",
        ),
        UniqueConstraint("unit_uid", name="uq_medicine_units_unit_uid"),
        UniqueConstraint("serial_number", name="uq_medicine_units_serial_number"),
        Index("ix_medicine_units_batch_id", "batch_id"),
        Index("ix_medicine_units_owner_status", "current_owner_id", "status"),
        Index("ix_medicine_units_pending_transfer_id", "pending_transfer_id"),
    )

    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("medicine_batches.id", ondelete="RESTRICT"), nullable=False)
    unit_uid = Column(
        UUID(as_uuid=True), nullable=False, default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    serial_number = Column(String(80), nullable=False)
    current_owner_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    status = Column(String(24), nullable=False, default="available", server_default="available")
    pending_transfer_id = Column(
        Integer, ForeignKey("unit_transfer_operations.id", ondelete="RESTRICT"), nullable=True,
    )
    reserved_order_id = Column(Integer, ForeignKey("orders.id", ondelete="RESTRICT"), nullable=True)
    reserved_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
