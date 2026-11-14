from datetime import datetime
from app.models.temperature import TemperatureReading
from app.models.flag import Flag


def is_breach(batch, temp):
    return (batch.min_temp is not None and batch.max_temp is not None
            and (temp < batch.min_temp or temp > batch.max_temp))


def add_reading(db, batch, user_id, temp, location, device_id, when=None):
    breach = is_breach(batch, temp)
    row = TemperatureReading(
        batch_id=batch.id, recorded_by=user_id, device_id=device_id,
        temperature_c=temp, location=location, is_breach=breach,
        recorded_at=when or datetime.now(),
    )
    db.add(row)
    if breach:
        # one open cold-chain flag per batch is enough
        open_flag = (db.query(Flag)
                     .filter(Flag.batch_id == batch.id, Flag.resolved == False,
                             Flag.reason.like("Cold chain breach%")).first())
        if not open_flag:
            reason = f"Cold chain breach: {temp}°C outside {batch.min_temp:g}-{batch.max_temp:g}°C at {location}"
            db.add(Flag(batch_id=batch.id, reason=reason[:200]))
    db.commit()
    db.refresh(row)
    return row


def coldchain_summary(db, batch):
    if not batch.requires_cold_chain:
        return {"required": False}
    rows = (db.query(TemperatureReading)
            .filter(TemperatureReading.batch_id == batch.id)
            .order_by(TemperatureReading.recorded_at.asc(), TemperatureReading.id.asc()).all())
    breaches = [r for r in rows if r.is_breach]
    status = "no_data" if not rows else ("breached" if breaches else "ok")
    return {
        "required": True,
        "range": f"{batch.min_temp:g} to {batch.max_temp:g} °C",
        "status": status,
        "readings": len(rows),
        "breaches": len(breaches),
        "last_temp": rows[-1].temperature_c if rows else None,
        "log": [
            {"temperature_c": r.temperature_c, "location": r.location,
             "device_id": r.device_id, "breach": r.is_breach,
             "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None}
            for r in rows[-20:]
        ],
    }