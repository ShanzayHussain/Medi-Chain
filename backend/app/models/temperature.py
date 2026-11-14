from sqlalchemy import Column, Integer, String, Boolean, Float, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class TemperatureReading(Base):
    __tablename__ = "temperature_readings"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("medicine_batches.id"))
    recorded_by = Column(Integer, ForeignKey("users.id"))
    device_id = Column(String(50))
    temperature_c = Column(Float, nullable=False)
    location = Column(String(100))
    is_breach = Column(Boolean, default=False)
    recorded_at = Column(TIMESTAMP, server_default=func.now())