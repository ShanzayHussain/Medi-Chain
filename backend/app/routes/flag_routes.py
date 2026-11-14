from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.flag import Flag
from app.models.batch import MedicineBatch
from app.auth.dependencies import require_role

router = APIRouter(prefix="/flags", tags=["flags"])


@router.get("/")
def list_flags(db: Session = Depends(get_db), user=Depends(require_role(["admin"]))):
    rows = (db.query(Flag, MedicineBatch)
            .join(MedicineBatch, MedicineBatch.id == Flag.batch_id)
            .order_by(Flag.id.desc()).all())

    def item(f, b):
        return {"title": b.drug_name, "subtitle": f.reason,
                "tag": "resolved" if f.resolved else "open", "batch_uid": str(b.batch_uid)}

    open_items = [item(f, b) for f, b in rows if not f.resolved]
    done_items = [item(f, b) for f, b in rows if f.resolved]
    return {
        "summary": {"Open flags": len(open_items), "Resolved": len(done_items)},
        "sections": [
            {"title": "Open flags", "items": open_items},
            {"title": "Resolved", "items": done_items},
        ],
    }


@router.post("/{flag_id}/resolve")
def resolve_flag(flag_id: int, db: Session = Depends(get_db), user=Depends(require_role(["admin"]))):
    f = db.get(Flag, flag_id)
    if not f:
        raise HTTPException(status_code=404, detail="Flag not found")
    f.resolved = True
    db.commit()
    return {"message": "Flag resolved"}