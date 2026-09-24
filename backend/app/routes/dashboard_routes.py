from fastapi import APIRouter, Depends
from app.auth.dependencies import require_role

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/manufacturer")
def manufacturer_dashboard(user=Depends(require_role(["manufacturer"]))):
    return {"message": "TODO: manufacturer dashboard data"}

@router.get("/distributor")
def distributor_dashboard(user=Depends(require_role(["distributor"]))):
    return {"message": "TODO: distributor dashboard data"}

@router.get("/pharmacy")
def pharmacy_dashboard(user=Depends(require_role(["pharmacy"]))):
    return {"message": "TODO: pharmacy dashboard data"}

@router.get("/admin")
def admin_dashboard(user=Depends(require_role(["admin"]))):
    return {"message": "TODO: admin dashboard data"}

@router.get("/customer")
def customer_dashboard(user=Depends(require_role(["customer"]))):
    return {"message": "TODO: customer scan history"}