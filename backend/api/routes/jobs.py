# backend/api/routes/jobs.py
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from services.job_service import get_jobs_by_location, get_job_by_id, get_jobs_by_bbox

router = APIRouter()

@router.get("/jobs")
def jobs(
    city: Optional[str] = Query(None, description="City name (e.g. 'Boston')"),
    state: Optional[str] = Query(None, description="State abbreviation (e.g. 'MA')"),
    limit: int = Query(50, ge=1, le=100),
):
    """
    Return jobs matching a given city (and optional state).
    If no city provided, returns recent jobs (limit).
    """
    try:
        results = get_jobs_by_location(city, state, limit=limit)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/jobs/{job_id}")
def job_detail(job_id: int):
    job = get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.get("/jobs/bbox")
def jobs_in_bbox(
    lat_min: float = Query(...),
    lat_max: float = Query(...),
    lon_min: float = Query(...),
    lon_max: float = Query(...),
    limit: int = Query(100, ge=1, le=500),
):
    """
    Return jobs whose location lat/lon lies inside the bbox.
    Note: requires latitude/longitude to be present in locations table.
    """
    return {"results": get_jobs_by_bbox(lat_min, lat_max, lon_min, lon_max, limit=limit)}
