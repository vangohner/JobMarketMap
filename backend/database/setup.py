# database/setup.py
import pandas as pd
import psycopg2
import os
from database.connection import DB_CONFIG
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

CSV_PATH = os.getenv("JOB_CSV_PATH", "data/job_data.csv")

CREATE_LOCATIONS = """
CREATE TABLE IF NOT EXISTS locations (
    location_id SERIAL PRIMARY KEY,
    raw_location TEXT,
    city VARCHAR(150),
    state VARCHAR(150),
    country VARCHAR(150),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION
);
"""

CREATE_JOBS = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id BIGINT PRIMARY KEY,
    title TEXT,
    company_name TEXT,
    description TEXT,
    normalized_salary NUMERIC,
    zip_code VARCHAR(20),
    fips VARCHAR(20),
    original_listed_time TIMESTAMP,
    location_id INT REFERENCES locations(location_id)
);
"""

def parse_location(raw_loc: str):
    # basic parse "City, State" or "City, State, Country"
    if pd.isna(raw_loc):
        return (None, None, None)
    parts = [p.strip() for p in raw_loc.split(",")]
    if len(parts) == 1:
        return (parts[0], None, None)
    if len(parts) == 2:
        return (parts[0], parts[1], None)
    if len(parts) >= 3:
        return (parts[0], parts[1], ", ".join(parts[2:]))
    return (raw_loc, None, None)

def main():
    print("Reading CSV:", CSV_PATH)
    df = pd.read_csv(CSV_PATH, dtype=str)  # read everything as string and cast later
    # ensure job_id exists and is unique
    if "job_id" not in df.columns:
        raise SystemExit("CSV missing 'job_id' column")

    # normalize columns used below - if your CSV differs, change these names
    df = df.rename(columns={
        "normalized_salary": "normalized_salary",
        "original_listed_time": "original_listed_time",
        "zip_code": "zip_code",
        "fips": "fips"
    })

    # fill nulls explicitly
    df = df.fillna("")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    # create tables
    cur.execute(CREATE_LOCATIONS)
    cur.execute(CREATE_JOBS)
    conn.commit()

    # Build locations table
    unique_locs = df["location"].unique().tolist()
    loc_rows = []
    for raw in unique_locs:
        city, state, country = parse_location(raw)
        loc_rows.append((raw, city, state, country, None, None))

    # Insert locations (avoiding duplicates by raw_location)
    print("Inserting locations:", len(loc_rows))
    execute_values(
        cur,
        """
        INSERT INTO locations (raw_location, city, state, country, latitude, longitude)
        VALUES %s
        ON CONFLICT (raw_location) DO NOTHING
        """,
        loc_rows,
        template=None,
        page_size=1000,
    )
    conn.commit()

    # Build mapping raw_location -> location_id
    cur.execute("SELECT location_id, raw_location FROM locations")
    mapping = {row[1]: row[0] for row in cur.fetchall()}

    # Prepare job rows for insertion
    job_rows = []
    for _, row in df.iterrows():
        job_id = int(row["job_id"]) if row["job_id"] != "" else None
        title = row.get("title", "")
        company_name = row.get("company_name", "")
        description = row.get("description", "")
        normalized_salary = row.get("normalized_salary", "") or None
        try:
            normalized_salary = float(normalized_salary) if normalized_salary is not None and normalized_salary != "" else None
        except Exception:
            normalized_salary = None
        zip_code = row.get("zip_code", "")
        fips = row.get("fips", "")
        ol_time = row.get("original_listed_time", "") or None
        raw_loc = row.get("location", "")
        location_id = mapping.get(raw_loc)

        job_rows.append((
            job_id, title, company_name, description,
            normalized_salary, zip_code, fips, ol_time, location_id
        ))

    print("Inserting jobs:", len(job_rows))
    execute_values(
        cur,
        """
        INSERT INTO jobs (job_id, title, company_name, description, normalized_salary, zip_code, fips, original_listed_time, location_id)
        VALUES %s
        ON CONFLICT (job_id) DO NOTHING
        """,
        job_rows,
        page_size=1000
    )
    conn.commit()
    cur.close()
    conn.close()
    print("Done: DB seeded.")

if __name__ == "__main__":
    main()
