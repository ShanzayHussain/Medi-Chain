import uuid
from sqlalchemy import Column, Integer, String, Date, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base

class MedicineBatch(Base):
    __tablename__ = "medicine_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_uid = Column(UUID(as_uuid=True), unique=True, default=uuid.uuid4, index=True)
    drug_name = Column(String(150))
    manufacturer_id = Column(Integer, ForeignKey("users.id"))
    quantity = Column(Integer)
    manufacture_date = Column(Date)
    expiry_date = Column(Date)
    status = Column(String(20), default="created")
    created_at = Column(TIMESTAMP, server_default=func.now())