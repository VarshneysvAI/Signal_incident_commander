from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from typing import List
from ..models import Incident, QueryRecord
from ..schemas import QueryRequest, QueryResponse, QueryRecordResponse

router = APIRouter()


@router.post("/incidents/{incident_id}/query", response_model=QueryResponse)
def query_incident(incident_id: str, query_req: QueryRequest, db: Session = Depends(get_db)):
    """Query the incident knowledge base."""
    from ..services.query_service import query_service
    
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    result = query_service.answer_query(db, incident_id, query_req.text, query_req.speaker_name)
    
    return QueryResponse(
        intent=result.get("intent", "open"),
        answer=result.get("answer", "I don't have enough information to answer that."),
        answer_method=result.get("answer_method", "template"),
        grounded_node_ids=result.get("grounded_node_ids", [])
    )


@router.get("/incidents/{incident_id}/queries", response_model=List[QueryRecordResponse])
def list_incident_queries(incident_id: str, db: Session = Depends(get_db)):
    """List historical queries and answers for an incident."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    records = db.query(QueryRecord).filter(
        QueryRecord.incident_id == incident_id
    ).order_by(QueryRecord.created_at.desc()).all()
    
    return [
        QueryRecordResponse(
            id=r.id,
            incident_id=r.incident_id,
            speaker=r.speaker,
            text=r.text,
            intent=r.intent,
            answer=r.answer,
            answer_method=r.answer_method or "template",
            grounded_node_ids=r.grounded_node_ids_json or [],
            created_at=r.created_at
        )
        for r in records
    ]
