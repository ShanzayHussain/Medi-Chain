from fastapi import APIRouter, Depends
from app.auth.dependencies import require_role

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.post("/")
def create_transaction(user=Depends(require_role(["pharmacy", "distributor"]))):
    return {"message": "TODO: record transaction"}

@router.get("/")
def list_transactions(user=Depends(require_role(["admin"]))):
    return {"message": "TODO: list all transactions"}