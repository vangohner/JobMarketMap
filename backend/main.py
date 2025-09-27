# backend/main.py
from fastapi import FastAPI
from api.routes import jobs as jobs_router

app = FastAPI(title="Job Market Analysis API")

app.include_router(jobs_router.router, prefix="/api")

# simple healthcheck
@app.get("/health")
def health():
    return {"status": "ok"}
