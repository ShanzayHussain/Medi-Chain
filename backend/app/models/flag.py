from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class Flag(Base):
    __tablename__ = "flags"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("medicine_batches.id"))
    reason = Column(String(200))
    flagged_at = Column(TIMESTAMP, server_default=func.now())
    resolved = Column(Boolean, default=False)