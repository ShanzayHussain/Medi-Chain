from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class CustodyLedger(Base):
    __tablename__ = "custody_ledger"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("medicine_batches.id"))
    event_type = Column(String(30))       # CREATED / TRANSFERRED / RECEIVED / SOLD
    actor_id = Column(Integer, ForeignKey("users.id"))
    actor_role = Column(String(20))
    location = Column(String(100))
    timestamp = Column(TIMESTAMP, server_default=func.now())
    previous_hash = Column(String(64))
    current_hash = Column(String(64))