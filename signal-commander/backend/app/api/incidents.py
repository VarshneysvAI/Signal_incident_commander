from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import uuid
from ..db import get_db
from ..models import Incident, IncidentStatus, EventLog
from ..schemas import IncidentCreate, IncidentResponse

router = APIRouter()


@router.post("/incidents", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def create_incident(incident: IncidentCreate, db: Session = Depends(get_db)):
    incident_id = str(uuid.uuid4())[:8]
    
    db_incident = Incident(
        id=incident_id,
        title=incident.title,
        channel_name=incident.channel_name,
        status=IncidentStatus.active
    )
    db.add(db_incident)
    
    # Create incident root node
    from ..models import GraphNode, NodeType, NodeStatus, Confidence
    incident_node = GraphNode(
        incident_id=incident_id,
        type=NodeType.incident,
        label=incident.title,
        status=NodeStatus.active,
        confidence=Confidence.high,
        metadata_json={"created_at": datetime.utcnow().isoformat()}
    )
    db.add(incident_node)
    
    # Log event
    event = EventLog(
        incident_id=incident_id,
        event_type="incident_created",
        payload_json={"title": incident.title}
    )
    db.add(event)
    
    db.commit()
    db.refresh(db_incident)
    
    return db_incident


@router.get("/incidents/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.post("/incidents/{incident_id}/close", response_model=IncidentResponse)
def close_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    incident.status = IncidentStatus.closed
    incident.closed_at = datetime.utcnow()
    
    # Log event
    event = EventLog(
        incident_id=incident_id,
        event_type="incident_closed",
        payload_json={}
    )
    db.add(event)
    
    db.commit()
    db.refresh(incident)
    
    return incident


@router.delete("/incidents/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    db.delete(incident)
    db.commit()
    
    return None


@router.get("/incidents", response_model=List[IncidentResponse])
def list_incidents(db: Session = Depends(get_db)):
    incidents = db.query(Incident).order_by(Incident.started_at.desc()).all()
    return incidents
