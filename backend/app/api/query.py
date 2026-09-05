from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Incident
from ..schemas import QueryRequest, QueryResponse

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
