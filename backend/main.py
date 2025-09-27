from fastapi import FastAPI, HTTPException, Query
from typing import Optional
import db
import pysupercluster
import numpy as np
#from pysupercluster import SuperCluster

app = FastAPI(title="Job Market API")

# -----------------------------
# Endpoints
# -----------------------------
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/jobs")
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

@app.get("/api/jobs/bbox")
def jobs_in_bbox(
    lat_min: float = Query(...),
    lat_max: float = Query(...),
    lon_min: float = Query(...),
    lon_max: float = Query(...),
    zoom: int = Query(3)  # optional zoom parameter
):
    try:
        # Fetch jobs from DB within bounding box
        jobs = db.fetch_jobs_in_bbox(lat_min, lat_max, lon_min, lon_max)

        # Convert to GeoJSON features
        valid_jobs = [job for job in jobs if job.get("lat") is not None and job.get("long") is not None]
        points = np.array([(job["long"], job["lat"]) for job in valid_jobs])

        # Create Supercluster, load points, get clusters
        sc = pysupercluster.SuperCluster(
            points,
            min_zoom=0,
            max_zoom=16,
            radius=80,
            extent=512
        )

        # Get clusters for the requested bbox and zoom
        clusters = sc.getClusters(
            top_left=(lon_min, lat_max),
            bottom_right=(lon_max, lat_min),
            zoom=zoom
        )

        return {"results": clusters}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jobs/{job_id}")
def job_detail(job_id: int):
    job = db.fetch_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job