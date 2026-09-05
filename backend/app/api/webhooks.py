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
    import re
    from ..config import settings
    
    # Verify secret if configured
    if settings.agora_webhook_secret:
        if not x_signal_secret or x_signal_secret != settings.agora_webhook_secret:
            raise HTTPException(status_code=401, detail="Invalid webhook secret")
    
    # Extract fields (flexible schema)
    event_id = payload.get("event_id")
    channel_name = payload.get("channel_name")
    payload_incident_id = payload.get("incident_id")
    speaker_uid = payload.get("speaker_uid")
    speaker_name = payload.get("speaker_name")
    text = payload.get("text", "")
    
    if not event_id or not text:
        raise HTTPException(status_code=400, detail="Missing event_id or text")
    
    # 1. Echo-Loop Guard: Ignore audio emitted by the agent itself
    speaker_uid_str = str(speaker_uid or "").strip().lower()
    speaker_name_str = str(speaker_name or "").strip().lower()
    AGENT_IDENTIFIERS = {"agent", "signal_agent", "cai_agent", "signal", "999999"}
    
    if (
        payload.get("is_agent")
        or speaker_uid_str in AGENT_IDENTIFIERS
        or speaker_name_str in AGENT_IDENTIFIERS
    ):
        return {"status": "ignored", "reason": "echo_loop_agent_audio"}
    
    # 2. Dynamic Speaker Identification (No static hardcoded names)
    custom_map = payload.get("speaker_map") or {}
    if not speaker_name or speaker_name.lower() in ["unknown", "user", "speaker"]:
        if speaker_uid_str in custom_map:
            speaker_name = custom_map[speaker_uid_str]
        elif speaker_uid:
            speaker_name = f"Speaker {speaker_uid}"
        else:
            speaker_name = "Speaker 1"
    
    # 1. Phonetic Normalization for common browser speech-to-text mishearings
    text = re.sub(r"\b(?:allies|a lies|ellis|elis)\b", "Alice", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:bop)\b", "Bob", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:carrel|carroll)\b", "Carol", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:serah|sara)\b", "Sarah", text, flags=re.IGNORECASE)

    # 2. Dynamic in-speech speaker extraction (e.g. "Bob: connection pool exhausted", "Hello I am Bob: ...", "Sarah here: ...")
    m = re.match(r"^([A-Z][a-zA-Z0-9_\-]{1,20})\s*[:\-]\s*(.+)", text.strip(), re.DOTALL)
    if m:
        cand = m.group(1).title()
        if cand.lower() not in ["note", "fact", "hypothesis", "action", "alert", "error", "warning", "info", "step", "signal", "question", "http", "https"]:
            speaker_name = cand
            text = m.group(2).strip()
    else:
        m2 = re.match(r"^(?:hello\s+|hi\s+|hey\s+)?(?:this is|i am|i'm)\s+([A-Z][a-zA-Z0-9_\-]{1,20})(?:\s+from\s+[\w\s]+)?(?:\s+here)?\s*[:,\- ]\s*(.+)", text.strip(), re.IGNORECASE | re.DOTALL)
        if m2:
            speaker_name = m2.group(1).title()
            text = m2.group(2).strip()
        else:
            m3 = re.match(r"^([A-Z][a-zA-Z0-9_\-]{1,20})\s+here\s*[:,-]\s*(.+)", text.strip(), re.IGNORECASE | re.DOTALL)
            if m3:
                speaker_name = m3.group(1).title()
                text = m3.group(2).strip()
    
    # Dedup by event_id
    from ..models import Utterance
    existing = db.query(Utterance).filter(Utterance.event_id == event_id).first()
    if existing:
        return {"status": "ignored", "reason": "duplicate"}
    
    # Find or create incident by incident_id or channel_name
    incident = None
    if payload_incident_id:
        incident = db.query(Incident).filter(Incident.id == payload_incident_id).first()
    if not incident and channel_name:
        incident = db.query(Incident).filter(Incident.channel_name == channel_name).first()
    
    if not incident:
        # Create new incident
        from datetime import datetime
        import uuid as uuid_mod
        
        target_ch = channel_name or "default-voice"
        incident_id = str(uuid_mod.uuid4())[:8]
        incident = Incident(
            id=incident_id,
            title=f"Voice Incident: {target_ch}",
            channel_name=target_ch,
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
    
    from ..services.parser_service import parser_service
    from ..services.graph_service import graph_service
    from ..services.query_service import query_service
    from ..models import EventLog, ParserMethod, Confidence as ConfEnum
    
    # 3. Wake-Word Detection & Auto-Routing (Skip Graph Nodes)
    wake_match = re.match(r"^(?:hey\s+)?signal[,:]?\s*(.*)", text.strip(), re.IGNORECASE)
    if wake_match:
        query_text = wake_match.group(1).strip()
        if not query_text:
            query_text = text.strip()
            
        query_res = query_service.answer_query(db, incident.id, query_text, speaker_name)
        
        utterance = Utterance(
            incident_id=incident.id,
            event_id=event_id,
            speaker_name=speaker_name,
            text=text,
            normalized_text=query_text,
            parser_type="query",
            parser_method=ParserMethod.deterministic,
            confidence=ConfEnum.high,
            negated=False,
            topic="query",
            raw_parser_json=query_res
        )
        db.add(utterance)
        db.flush()
        
        # Broadcast voice_query_answered for SSE and browser TTS
        db.add(EventLog(
            incident_id=incident.id,
            event_type="voice_query_answered",
            payload_json={
                "question": text,
                "clean_question": query_text,
                "answer": query_res.get("answer"),
                "intent": query_res.get("intent"),
                "grounded_node_ids": query_res.get("grounded_node_ids", []),
                "speaker": speaker_name,
                "answer_method": query_res.get("answer_method", "template"),
                "source": "agora_webhook"
            }
        ))
        
        # CRITICAL: graph_service.process_utterance is NOT called here
        # to avoid polluting the incident knowledge graph with queries.
        db.commit()
        return {
            "status": "ok",
            "incident_id": incident.id,
            "utterance_id": utterance.id,
            "type": "voice_query",
            "answer": query_res.get("answer")
        }
    
    # 4. Standard Utterance Processing (Creates Graph Nodes/Edges)
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
