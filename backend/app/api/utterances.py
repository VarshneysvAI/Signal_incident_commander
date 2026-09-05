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
    
    import re
    # Check for wake word: "Signal, ..." or "Hey Signal, ..."
    wake_match = re.match(r"^(?:hey\s+)?signal[,:]?\s*(.*)", utterance.text.strip(), re.IGNORECASE)
    if wake_match:
        from ..services.query_service import query_service
        query_text = wake_match.group(1).strip()
        if not query_text:
            query_text = utterance.text.strip()
            
        result = query_service.answer_query(db, incident_id, query_text, utterance.speaker_name)
        
        db_utterance = Utterance(
            incident_id=incident_id,
            speaker_name=utterance.speaker_name,
            text=utterance.text,
            normalized_text=query_text,
            parser_type="query",
            parser_method=ParserMethod.deterministic,
            confidence=Confidence.high,
            negated=False,
            topic="query",
            raw_parser_json=result
        )
        db.add(db_utterance)
        db.flush()
        
        # Log voice_query_answered event for SSE and TTS
        event = EventLog(
            incident_id=incident_id,
            event_type="voice_query_answered",
            payload_json={
                "question": utterance.text,
                "clean_question": query_text,
                "answer": result.get("answer"),
                "intent": result.get("intent"),
                "grounded_node_ids": result.get("grounded_node_ids", []),
                "speaker": utterance.speaker_name,
                "answer_method": result.get("answer_method", "template")
            }
        )
        db.add(event)
        
        # NOTE: graph_service.process_utterance is intentionally omitted
        # to prevent question pollution in the knowledge graph.
        db.commit()
        db.refresh(db_utterance)
        return db_utterance
    
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
