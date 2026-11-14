from pydantic import BaseModel, EmailStr, Field
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
    role: Optional[str] = None

class BatchCreate(BaseModel):
    drug_name: str
    quantity: int
    manufacture_date: date
    expiry_date: date

class CustodyTransfer(BaseModel):
    batch_uid: str
    location: str

class SaleCreate(BaseModel):
    batch_uid: str
    quantity: int = Field(gt=0)   # units sold in this sale, must be positive
    location: str