from fastapi import FastAPI
from app.routes import (
    auth_routes,
    batch_routes,
    custody_routes,
    transaction_routes,
    flag_routes,
    dashboard_routes,
)
from app.auth.dependencies import require_role
from fastapi import Depends
from app.models import user, batch, custody_ledger, transaction, flag, temperature, order  # noqa: F401
from app.routes import coldchain_routes, ai_routes
from app.routes import payment_routes
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MediChain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(batch_routes.router)
app.include_router(custody_routes.router)
app.include_router(transaction_routes.router)
app.include_router(flag_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(coldchain_routes.router)
app.include_router(ai_routes.router)
app.include_router(payment_routes.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
