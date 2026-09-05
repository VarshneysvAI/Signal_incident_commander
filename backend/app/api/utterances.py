from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from ..db import get_db
from ..models import Utterance, Incident, EventLog, GraphNode, GraphEdge, ActionItem, NodeType, NodeStatus, EdgeType, Confidence, ParserMethod
from ..schemas import UtteranceCreate, UtteranceResponse
from ..services.parser_service import parser_service
from ..services.graph_service import graph_service

router = APIRouter()


@router.post("/incidents/{incident_id}/utterances", response_model=UtteranceResponse)
def create_utterance(
    incident_id: str,
    utterance: UtteranceCreate,
    db: Session = Depends(get_db)
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Parse utterance
    parsed = parser_service.parse(utterance.text, utterance.speaker_name)
    
    # Create utterance record
    db_utterance = Utterance(
        incident_id=incident_id,
        speaker_name=utterance.speaker_name,
        text=utterance.text,
        normalized_text=parsed.get("normalized_label"),
        parser_type=parsed.get("utterance_type"),
        parser_method=ParserMethod[parsed.get("parser_method", "deterministic")],
        confidence=Confidence[parsed.get("confidence", "medium")],
        negated=parsed.get("negated", False),
        topic=parsed.get("topic", "general"),
        raw_parser_json=parsed
    )
    db.add(db_utterance)
    db.flush()  # Get ID
    
    # Log event
    event = EventLog(
        incident_id=incident_id,
        event_type="utterance_received",
        payload_json={
            "speaker": utterance.speaker_name,
            "text": utterance.text,
            "parsed_type": parsed.get("utterance_type")
        }
    )
    db.add(event)
    
    # Create graph nodes/edges
    graph_service.process_utterance(db, incident_id, db_utterance, parsed)
    
    db.commit()
    db.refresh(db_utterance)
    
    return db_utterance


@router.get("/incidents/{incident_id}/utterances", response_model=List[UtteranceResponse])
def list_utterances(incident_id: str, db: Session = Depends(get_db)):
    utterances = db.query(Utterance).filter(
        Utterance.incident_id == incident_id
    ).order_by(Utterance.timestamp.asc()).all()
    return utterances
