from fastapi import FastAPI, HTTPException, Query
from typing import Optional
import db

app = FastAPI(title="Job Market API")

# -----------------------------
# Endpoints
# -----------------------------
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/jobs")
def jobs(
    city: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
):
    try:
        results = db.fetch_jobs_by_location(city, state, limit)
        # simple post-processing: truncate long descriptions
        for j in results:
            if j.get("description"):
                j["description_preview"] = (j["description"][:400] + "...") if len(j["description"]) > 400 else j["description"]
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/jobs/{job_id}")
def job_detail(job_id: int):
    job = db.fetch_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/jobs/bbox")
def jobs_in_bbox(
    lat_min: float = Query(...),
    lat_max: float = Query(...),
    lon_min: float = Query(...),
    lon_max: float = Query(...),
    limit: int = Query(100, ge=1, le=500),
):
    try:
        results = db.fetch_jobs_in_bbox(lat_min, lat_max, lon_min, lon_max, limit)
        for j in results:
            if j.get("description"):
                j["description_preview"] = (j["description"][:400] + "..." if len(j["description"]) > 400 else j["description"])
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
