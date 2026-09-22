from fastapi import FastAPI
from fastapi import Depends 
from app.routes import auth_routes
from app.auth.dependencies import require_role 

app = FastAPI(title="MediChain API")

app.include_router(auth_routes.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/manufacturer-only")
def manufacturer_test(user=Depends(require_role(["manufacturer"]))):
    return {"message": "You are a manufacturer", "user": user}