import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base


class UnitTransferOperation(Base):
    __tablename__ = "unit_transfer_operations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'received', 'rejected', 'cancelled')",
            name="ck_unit_transfer_operations_status",
        ),
        UniqueConstraint("operation_uid", name="uq_unit_transfer_operations_operation_uid"),
    )

    id = Column(Integer, primary_key=True)
    operation_uid = Column(
        UUID(as_uuid=True), nullable=False, default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status = Column(String(16), nullable=False, default="pending", server_default="pending")
    location = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    received_at = Column(DateTime(timezone=True), nullable=True)
