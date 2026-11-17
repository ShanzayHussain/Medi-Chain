import uuid

from fastapi import HTTPException


def parse_uuid(value: str, label: str = "ID") -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
