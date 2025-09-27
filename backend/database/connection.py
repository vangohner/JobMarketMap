# database/connection.py
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()  # reads .env in project root if present

DB_CONFIG = {
    "dbname": os.getenv("POSTGRES_DB", "job_db"),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", ""),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", 5432)),
}

def get_conn():
    conn = psycopg2.connect(**DB_CONFIG)
    return conn

def get_dict_conn():
    # returns connection with RealDictCursor usage possible in queries
    return get_conn()
