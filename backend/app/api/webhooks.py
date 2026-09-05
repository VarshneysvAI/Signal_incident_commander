from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from ..db import get_db
from ..models import Incident, IncidentStatus
from ..schemas import UtteranceCreate
import uuid

router = APIRouter()


@router.post("/webhooks/agora/transcript")
def agora_transcript_webhook(
    payload: dict,
    x_signal_secret: Optional[str] = Header(None, alias="X-SIGNAL-SECRET"),
    db: Session = Depends(get_db)
):
    """
    Receive Agora transcript webhook.
    Expected payload: {event_id, channel_name, speaker_uid, speaker_name, text, timestamp}
    """
    from ..config import settings
    
    # Verify secret if configured
    if settings.agora_webhook_secret:
        if not x_signal_secret or x_signal_secret != settings.agora_webhook_secret:
            raise HTTPException(status_code=401, detail="Invalid webhook secret")
    
    # Extract fields (flexible schema)
    event_id = payload.get("event_id")
    channel_name = payload.get("channel_name")
    speaker_name = payload.get("speaker_name", "Unknown")
    text = payload.get("text", "")
    
    if not event_id or not text:
        raise HTTPException(status_code=400, detail="Missing event_id or text")
    
    # Dedup by event_id
    from ..models import Utterance
    existing = db.query(Utterance).filter(Utterance.event_id == event_id).first()
    if existing:
        return {"status": "ignored", "reason": "duplicate"}
    
    # Find or create incident by channel_name
    incident = db.query(Incident).filter(
        Incident.channel_name == channel_name
    ).first()
    
    if not incident:
        # Create new incident
        from datetime import datetime
        import uuid as uuid_mod
        
        incident_id = str(uuid_mod.uuid4())[:8]
        incident = Incident(
            id=incident_id,
            title=f"Voice Incident: {channel_name}",
            channel_name=channel_name,
            status=IncidentStatus.active
        )
        db.add(incident)
        
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
        db.flush()
    
    # Process utterance (same as text input)
    from ..services.parser_service import parser_service
    from ..services.graph_service import graph_service
    from ..models import EventLog, ParserMethod, Confidence as ConfEnum
    
    parsed = parser_service.parse(text, speaker_name)
    
    utterance = Utterance(
        incident_id=incident.id,
        event_id=event_id,
        speaker_name=speaker_name,
        text=text,
        normalized_text=parsed.get("normalized_label"),
        parser_type=parsed.get("utterance_type"),
        parser_method=ParserMethod[parsed.get("parser_method", "deterministic")],
        confidence=ConfEnum[parsed.get("confidence", "medium")],
        negated=parsed.get("negated", False),
        topic=parsed.get("topic", "general"),
        raw_parser_json=parsed
    )
    db.add(utterance)
    db.flush()
    
    # Log event
    db.add(EventLog(
        incident_id=incident.id,
        event_type="utterance_received",
        payload_json={
            "speaker": speaker_name,
            "text": text,
            "parsed_type": parsed.get("utterance_type"),
            "source": "agora_webhook"
        }
    ))
    
    # Create graph nodes/edges
    graph_service.process_utterance(db, incident.id, utterance, parsed)
    
    db.commit()
    
    return {"status": "ok", "incident_id": incident.id, "utterance_id": utterance.id}
