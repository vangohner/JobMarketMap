# add_job.py
from db import get_cursor
import pandas as pd
from datetime import datetime
import numpy as np

# First, create the table
CREATE_JOBS_TABLE = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id BIGINT PRIMARY KEY,
    company_name TEXT,
    title TEXT,
    description TEXT,
    location TEXT,
    work_type TEXT,
    listed_time TIMESTAMP,
    remote_allowed BOOLEAN,
    experience_level TEXT,
    skills_desc TEXT,
    salary NUMERIC,
    zip_code INT,
    lat DOUBLE PRECISION,
    long DOUBLE PRECISION
);
"""

with get_cursor(dict_cursor=False) as cur:
    cur.execute(CREATE_JOBS_TABLE)



def add_job(job_id, company_name, title, description, location, work_type, listed_time, remote_allowed, experience_level, skills_desc, salary, zip_code, lat, long):
    sql = """
    INSERT INTO jobs (job_id, company_name, title, description, location, work_type, listed_time, remote_allowed, experience_level, skills_desc, salary, zip_code, lat, long)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (job_id) DO NOTHING
    """
    with get_cursor() as cur:
        cur.execute(sql, (job_id, company_name, title, description, location, work_type, listed_time, remote_allowed, experience_level, skills_desc, salary, zip_code, lat, long))
        print(f"Inserted job {job_id}")


def import_data():
    df = pd.read_csv("data/job_data.csv")
    #print(df.head)
    
    for row in df.itertuples():
        dt = datetime.fromtimestamp(row.original_listed_time / 1000)
        remote_allowed = (row.remote_allowed == np.nan)
        
        add_job(
            row.job_id,
            row.company_name,
            row.title,
            row.description,
            row.location,
            row.formatted_work_type,
            dt, # convert the time into a datetime object
            remote_allowed,
            row.formatted_experience_level,
            row.skills_desc,
            row.normalized_salary,
            row.zip_code,
            row.lat,
            row.long,
        )


if __name__ == "__main__":
    # example usage
    import_data()
