import pandas as pd
import pgeocode
import numpy as np

df = pd.read_csv("data/job_data.csv")

# remove the columns we don't want
try:
    df = df.drop(
        [
            "compensation_type", 
            "expiry", 
            "applies", 
            "application_url", 
            "application_type", 
            "closed_time", 
            "work_type",
            "views",
            "posting_domain",
            "pay_period",
            "company_id",
            "job_posting_url",
            "sponsored",
            "currency",
            "max_salary",
            "med_salary",
            "min_salary",
            "listed_time",
            "fips"
        ], 
        axis="columns"
    )
except KeyError:
    print("columns already removed.")

# drop rows with null values
df = df.dropna(
    subset=[
        "job_id", 
        "company_name", 
        "title", 
        "description", 
        "location", 
        "formatted_work_type", 
        "original_listed_time",
        "normalized_salary",
        "zip_code",
    ]
)

# add latitude and longitude coordinates to the location
df["lat"] = np.nan
df["long"] = np.nan

nomi = pgeocode.Nominatim('us')
for index, row in df.iterrows():
    location = nomi.query_postal_code(int(row["zip_code"]))
    df.at[index, "lat"] = location.latitude
    df.at[index, "long"] = location.longitude
    
df = df.dropna(subset=["lat", "long",])

df.to_csv("data/job_data.csv", index = False)

column_names = df.columns.tolist()
print(column_names)
print(df.head())
print(df.iloc[5])   # row 6 (0-based index)
