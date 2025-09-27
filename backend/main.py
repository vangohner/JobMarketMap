from fastapi import FastAPI, HTTPException, Query
from typing import Optional
import db
import pysupercluster
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
        # fetch jobs in bounding box
        query_results = db.fetch_jobs_in_bbox(lat_min, lat_max, lon_min, lon_max)

        # convert to GeoJSON features
        points = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [j["long"], j["lat"]]},
                "properties": {"title": j["title"], "job_id": j["job_id"]}
            }
            for j in query_results
            if j["lat"] is not None and j["long"] is not None
        ]

        # server-side clustering
        sc = pysupercluster.SuperCluster(
            radius=80,
            max_zoom=16,
            map=lambda p: {"titleCounts": {p["properties"]["title"]: 1}},
            reduce=lambda a, b: a["titleCounts"].update({k: a["titleCounts"].get(k,0)+v for k,v in b["titleCounts"].items()})
        )
        sc.load(points)
        clusters = sc.get_clusters([lon_min, lat_min, lon_max, lat_max], zoom)

        return {"results": clusters}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jobs/{job_id}")
def job_detail(job_id: int):
    job = db.fetch_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job