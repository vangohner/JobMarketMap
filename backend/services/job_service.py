# services/job_service.py
from database.queries import fetch_jobs_by_location, fetch_job_by_id, fetch_jobs_by_bbox

def get_jobs_by_location(city: str = None, state: str = None, limit: int = 50):
    """
    Business logic wrapper for location queries.
    Could add auth, caching, filtering, score ranking, DTO mapping here.
    """
    jobs = fetch_jobs_by_location(city, state, limit)
    # simple post-processing: truncate long descriptions, etc.
    for j in jobs:
        if j.get("description"):
            j["description_preview"] = (j["description"][:400] + "...") if len(j["description"]) > 400 else j["description"]
            # remove the full description if you don't want to send it to front-end
            # j.pop("description", None)
    return jobs

def get_job_by_id(job_id: int):
    j = fetch_job_by_id(job_id)
    return j

def get_jobs_in_bbox(lat_min, lat_max, lon_min, lon_max, limit=100):
    return fetch_jobs_by_bbox(lat_min, lat_max, lon_min, lon_max, limit)
