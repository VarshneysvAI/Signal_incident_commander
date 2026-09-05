from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from ..db import get_db
from ..models import Incident
from ..services.document_service import document_service

router = APIRouter()


@router.get("/incidents/{incident_id}/document")
def get_incident_document(incident_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get formatted incident document with sections and Gap Radar analysis."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    doc = document_service.get_formatted_document(db, incident_id)
    return doc


@router.get("/incidents/{incident_id}/timeline")
def get_incident_timeline(incident_id: str, db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """Get chronological timeline of utterances for an incident."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    return document_service.get_timeline(db, incident_id)
