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
    raw_text = utterance.text.strip()
    speaker_name = utterance.speaker_name or "Unknown"

    # Dynamic in-speech speaker extraction (e.g. "Bob: connection pool exhausted" or "Sarah here: 504 timeouts")
    m = re.match(r"^([A-Z][a-zA-Z0-9_\-]{1,20})\s*[:\-]\s*(.+)", raw_text, re.DOTALL)
    if m:
        cand = m.group(1).title()
        if cand.lower() not in ["note", "fact", "hypothesis", "action", "alert", "error", "warning", "info", "step", "signal", "question", "http", "https"]:
            speaker_name = cand
            raw_text = m.group(2).strip()
    else:
        m2 = re.match(r"^(?:this is|i am)\s+([A-Z][a-zA-Z0-9_\-]{1,20})(?:\s+from\s+[\w\s]+)?(?:\s+here)?\s*[:,-]\s*(.+)", raw_text, re.IGNORECASE | re.DOTALL)
        if m2:
            speaker_name = m2.group(1).title()
            raw_text = m2.group(2).strip()
        else:
            m3 = re.match(r"^([A-Z][a-zA-Z0-9_\-]{1,20})\s+here\s*[:,-]\s*(.+)", raw_text, re.IGNORECASE | re.DOTALL)
            if m3:
                speaker_name = m3.group(1).title()
                raw_text = m3.group(2).strip()

    # Check for wake word: "Signal, ..." or "Hey Signal, ..."
    wake_match = re.match(r"^(?:hey\s+)?signal[,:]?\s*(.*)", raw_text, re.IGNORECASE)
    if wake_match:
        from ..services.query_service import query_service
        query_text = wake_match.group(1).strip()
        if not query_text:
            query_text = raw_text
            
        result = query_service.answer_query(db, incident_id, query_text, speaker_name)
        
        db_utterance = Utterance(
            incident_id=incident_id,
            speaker_name=speaker_name,
            text=raw_text,
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
    parsed = parser_service.parse(raw_text, speaker_name)
    
    # Create utterance record
    db_utterance = Utterance(
        incident_id=incident_id,
        speaker_name=speaker_name,
        text=raw_text,
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
            "speaker": speaker_name,
            "text": raw_text,
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
