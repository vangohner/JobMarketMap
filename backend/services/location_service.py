"""
Location Service - Geographic data operations
"""
from sqlalchemy.orm import Session
from database.queries import JobQueries
from typing import List, Dict

class LocationService:
    """Service layer for location-related operations"""
    
    def __init__(self):
        self.queries = JobQueries()
    
    def get_all_locations(self, db: Session) -> List[Dict]:
        """Get all locations with job statistics"""
        locations_db = self.queries.get_all_locations(db)
        
        return [
            {
                'location': loc.location,
                'job_count': loc.job_count,
                'avg_salary': float(loc.avg_salary) if loc.avg_salary else None
            }
            for loc in locations_db
        ]
    
    def get_zip_code_stats(self, db: Session) -> List[Dict]:
        """Get zip code statistics for map visualization"""
        zip_stats_db = self.queries.get_zip_code_stats(db)
        
        return [
            {
                'zip_code': stat.zip_code,
                'location': stat.location,
                'job_count': stat.job_count,
                'avg_salary': float(stat.avg_salary) if stat.avg_salary else None
            }
            for stat in zip_stats_db
        ]