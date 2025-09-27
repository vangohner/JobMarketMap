# database/queries.py
from database.connection import get_conn
from psycopg2.extras import RealDictCursor


def fetch_jobs_by_location(zip_code: int, limit: int = 50):
    """
    Fetch jobs by ZIP code (integer).
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    sql = """
    SELECT job_id, title, company_name, normalized_salary, description,
           location, formatted_work_type, original_listed_time, zip_code
    FROM jobs
    WHERE zip_code = %s
    ORDER BY original_listed_time DESC NULLS LAST
    LIMIT %s
    """
    cur.execute(sql, (zip_code, limit))
    rows = cur.fetchall()

    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def fetch_job_by_id(job_id: str):
    """
    Fetch a single job by its ID.
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    sql = """
    SELECT job_id, title, company_name, normalized_salary, description,
           location, formatted_work_type, original_listed_time, zip_code
    FROM jobs
    WHERE job_id = %s
    """
    cur.execute(sql, (job_id,))
    row = cur.fetchone()

    cur.close()
    conn.close()
    return dict(row) if row else None


def fetch_recent_jobs(limit: int = 50):
    """
    Fetch the most recent jobs regardless of location.
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    sql = """
    SELECT job_id, title, company_name, normalized_salary, description,
           location, formatted_work_type, original_listed_time, zip_code
    FROM jobs
    ORDER BY original_listed_time DESC NULLS LAST
    LIMIT %s
    """
    cur.execute(sql, (limit,))
    rows = cur.fetchall()

    cur.close()
    conn.close()
    return [dict(r) for r in rows]