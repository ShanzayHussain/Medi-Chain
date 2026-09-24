from fastapi import APIRouter, Depends
from app.auth.dependencies import require_role

router = APIRouter(prefix="/flags", tags=["flags"])

@router.get("/")
def list_flags(user=Depends(require_role(["admin"]))):
    return {"message": "TODO: list all flags"}

@router.post("/{flag_id}/resolve")
def resolve_flag(flag_id: int, user=Depends(require_role(["admin"]))):
    return {"message": f"TODO: resolve flag {flag_id}"}