import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()  # reads .env if present

DB_CONFIG = {
    "dbname": os.getenv("POSTGRES_DB", "jobdb"),
    "user": os.getenv("POSTGRES_USER", "jobuser"),
    "password": os.getenv("POSTGRES_PASSWORD", "password"),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", 5432)),
}

@contextmanager
def get_cursor(dict_cursor=True):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor if dict_cursor else None)
    try:
        yield cur
        conn.commit()
    finally:
        cur.close()
        conn.close()


# -----------------------------
# Query functions
# -----------------------------
def fetch_job_by_id(job_id):
    sql = "SELECT * FROM jobs WHERE job_id = %s"
    with get_cursor() as cur:
        cur.execute(sql, (job_id,))
        row = cur.fetchone()
        return dict(row) if row else None

def fetch_jobs_by_location(city=None, state=None, limit=50):
    sql = """
    SELECT j.*, l.city, l.state, l.country
    FROM jobs j
    JOIN locations l ON j.location_id = l.location_id
    WHERE (%s IS NULL OR l.city = %s)
      AND (%s IS NULL OR l.state = %s)
    ORDER BY j.original_listed_time DESC NULLS LAST
    LIMIT %s
    """
    with get_cursor() as cur:
        cur.execute(sql, (city, city, state, state, limit))
        return [dict(r) for r in cur.fetchall()]

def fetch_jobs_in_bbox(lat_min, lat_max, lon_min, lon_max, limit=100):
    sql = """
    SELECT j.*, l.latitude, l.longitude
    FROM jobs j
    JOIN locations l ON j.location_id = l.location_id
    WHERE l.latitude BETWEEN %s AND %s
      AND l.longitude BETWEEN %s AND %s
    LIMIT %s
    """
    with get_cursor() as cur:
        cur.execute(sql, (lat_min, lat_max, lon_min, lon_max, limit))
        return [dict(r) for r in cur.fetchall()]
