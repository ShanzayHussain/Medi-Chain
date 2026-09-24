from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date


class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str   # manufacturer/distributor/pharmacy/customer/admin
    organization_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class BatchCreate(BaseModel):
    drug_name: str
    quantity: int
    manufacture_date: date
    expiry_date: date

class CustodyTransfer(BaseModel):
    batch_uid: str
    location: str