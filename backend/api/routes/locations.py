from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database.connection import get_db
from services.location_service import LocationService

router = APIRouter()
location_service = LocationService()

@router.get("/all")
def get_all_locations(db: Session = Depends(get_db)):
    """Get all locations"""
    locations = location_service.get_all_locations(db)
    return {"locations": locations, "total": len(locations)}

@router.get("/zip-stats")
def get_zip_code_stats(db: Session = Depends(get_db)):
    """Get zip code stats for map visualization"""
    stats = location_service.get_zip_code_stats(db)
    return {"zip_codes": stats, "total": len(stats)}