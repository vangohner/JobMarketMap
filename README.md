Job Market Analysis Map

An interactive web application for visualizing and exploring job postings geographically with clustering, filtering, and detailed popups. The system integrates a FastAPI backend and a PostgreSQL database to support dynamic queries and advanced filtering.

Features
🌍 Interactive Map

Clustered visualization of job postings, powered by Supercluster + MapLibre GL JS.

Responsive cluster behavior: clusters expand or break apart as the user zooms in, providing both macro and micro job market insights.

Custom HTML cluster labels: show the top job titles in a region, optionally with percentages of how many postings match the top role.

📌 Detailed Popups

Clicking on a cluster reveals:

Job title(s)

Company name

Location

Work type (e.g., full-time, part-time, remote)

Salary (if available)

Posting date

🗄️ Backend (FastAPI + PostgreSQL)

PostgreSQL Database stores job postings with structured fields.

FastAPI service exposes endpoints for retrieving jobs and applying filters.

Supports filters such as:

Job title

Company name

Location

Experience level

Work type (full-time, part-time, etc.)

Salary range

📊 Data Schema

Jobs are stored with the following key fields:

job_id

company_name

title

description

location

formatted_work_type

original_listed_time

remote_allowed

formatted_experience_level

skills_desc

normalized_salary

zip_code

System Overview
[ PostgreSQL Database ]
          │
          ▼
[ FastAPI Backend ]
   • Query + Filter jobs
   • Serve JSON responses
          │
          ▼
[ Map Frontend ]
   • MapLibre GL for interactive map
   • Supercluster for clustering
   • Custom HTML popups

Goals

This project is designed to:

Provide an intuitive visualization of job opportunities across different regions.

Enable dynamic filtering by job title, company, and other attributes.

Support market research on employment trends (e.g., where certain industries or titles are concentrated).

Serve as a foundation for advanced analytics such as skill demand, salary trends, or remote vs. onsite comparisons.
