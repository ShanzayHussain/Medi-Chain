from sqlalchemy import Column, Integer, String, BigInteger, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("medicine_batches.id"))
    buyer_id = Column(Integer, ForeignKey("users.id"))
    seller_id = Column(Integer, ForeignKey("users.id"))
    quantity = Column(Integer)
    unit_price_pkr = Column(Integer)
    total_pkr = Column(Integer)
    method = Column(String(20), nullable=True)
    status = Column(String(20), default="pending")
    payment_ref = Column(String(80), nullable=True)
    tx_hash = Column(String(80), unique=True, nullable=True)
    failure_reason = Column(String(200), nullable=True)
    created_ts = Column(BigInteger)
    created_at = Column(TIMESTAMP, server_default=func.now())
    paid_at = Column(TIMESTAMP, nullable=True)