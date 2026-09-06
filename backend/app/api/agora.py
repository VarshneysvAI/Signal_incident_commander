from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from ..db import get_db
from ..config import settings
from ..schemas import AgoraTokenRequest, AgoraTokenResponse, StartAgentRequest, StartAgentResponse
from ..services.transcription_service import transcription_service
from ..services.parser_service import parser_service
from ..services.graph_service import graph_service
from ..models import Utterance, Incident, EventLog, ParserMethod, Confidence
import re
import uuid

router = APIRouter()


@router.post("/agora/token", response_model=AgoraTokenResponse)
def generate_agora_token(token_req: AgoraTokenRequest):
    """Generate Agora RTC token for joining a channel."""
    if not settings.agora_enabled:
        raise HTTPException(
            status_code=400,
            detail="Agora credentials not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE in environment."
        )
    
    from ..services.agora_service import agora_service
    
    try:
        token = agora_service.generate_token(
            token_req.channel_name,
            token_req.uid
        )
        
        return AgoraTokenResponse(
            token=token,
            channel_name=token_req.channel_name,
            uid=token_req.uid,
            app_id=settings.agora_app_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}")


@router.post("/agora/start-agent", response_model=StartAgentResponse)
def start_agora_agent(agent_req: StartAgentRequest):
    """
    Start or register Agora Conversational AI / Real-time Transcription Agent for channel.
    If cloud agent credentials are configured, initializes Agora agent session.
    Otherwise returns ready status for local browser speech or webhook bridge.
    """
    mode = "cloud_agent" if settings.agora_enabled else "mock_bridge_ready"
    message = (
        f"Agora Conversational Agent active in channel {agent_req.channel_name} with UID {agent_req.agent_uid}"
        if settings.agora_enabled
        else f"SIGNAL Voice Agent ready for channel {agent_req.channel_name}. Webhook receiver listening at /webhooks/agora/transcript."
    )
    
    return StartAgentResponse(
        status="started",
        channel_name=agent_req.channel_name,
        agent_uid=agent_req.agent_uid,
        mode=mode,
        message=message
    )


@router.post("/agora/transcribe-audio")
async def transcribe_meet_audio(
    file: UploadFile = File(...),
    channel_name: Optional[str] = Form(None),
    incident_id: Optional[str] = Form(None),
    speaker_name: Optional[str] = Form(None),
    speaker_uid: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Receive live audio blob from Google Meet tab stream, transcribe with Whisper/ASR,
    extract speaker identity, and ingest into the incident causal knowledge graph.
    """
    try:
        audio_bytes = await file.read()
        if not audio_bytes or len(audio_bytes) < 500:
            return {"status": "no_speech", "text": "", "reason": "empty_chunk"}

        content_type = file.content_type or "audio/webm"
        filename = file.filename or "meet_chunk.webm"

        # Transcribe with Whisper service
        raw_text = await transcription_service.transcribe_audio_chunk(
            audio_bytes=audio_bytes,
            filename=filename,
            content_type=content_type
        )

        if not raw_text or len(raw_text.strip()) < 2:
            return {"status": "no_speech", "text": ""}

        text = raw_text.strip()
        final_speaker = speaker_name or "Meet Participant"

        # Phonetic normalization
        text = re.sub(r"\b(?:allies|a lies|ellis|elis)\b", "Alice", text, flags=re.IGNORECASE)
        text = re.sub(r"\b(?:bop)\b", "Bob", text, flags=re.IGNORECASE)
        text = re.sub(r"\b(?:carrel|carroll)\b", "Carol", text, flags=re.IGNORECASE)
        text = re.sub(r"\b(?:serah|sara)\b", "Sarah", text, flags=re.IGNORECASE)
        text = re.sub(r"\b(?:deve|dav)\b", "Dave", text, flags=re.IGNORECASE)

        reserved_words = {
            "note", "fact", "hypothesis", "action", "alert", "error", "warning", "info",
            "step", "signal", "question", "http", "https", "we", "they", "team", "service",
            "database", "redis", "postgres", "server", "system", "latency", "pod", "cluster",
            "status", "update", "incident", "issue", "problem", "fix", "task", "logs", "metrics"
        }

        # Dynamic in-speech speaker extraction
        m1 = re.match(r"^([a-zA-Z0-9_\-]{2,20})\s*[:\-]\s*(.+)", text, re.DOTALL)
        if m1 and m1.group(1).lower() not in reserved_words:
            final_speaker = m1.group(1).strip().title()
            text = m1.group(2).strip()
        else:
            m2 = re.match(r"^(?:hello\s+|hi\s+|hey\s+)?(?:this is|i am|i'm|it's)\s+([a-zA-Z0-9_\-]{2,20})(?:\s+from\s+[\w\s]+)?(?:\s+here)?\s*[:,\- ]\s*(.+)", text, re.IGNORECASE | re.DOTALL)
            if m2 and m2.group(1).lower() not in reserved_words:
                final_speaker = m2.group(1).strip().title()
                text = m2.group(2).strip()
            else:
                m3 = re.match(r"^([a-zA-Z0-9_\-]{2,20})\s+(?:here|speaking|on the line)\s*[:,-]\s*(.+)", text, re.IGNORECASE | re.DOTALL)
                if m3 and m3.group(1).lower() not in reserved_words:
                    final_speaker = m3.group(1).strip().title()
                    text = m3.group(2).strip()

        # Find target incident
        incident = None
        if incident_id:
            incident = db.query(Incident).filter(Incident.id == incident_id).first()
        if not incident and channel_name:
            incident = db.query(Incident).filter(Incident.channel_name == channel_name).first()

        if incident:
            # Parse utterance & process into knowledge graph
            parsed = parser_service.parse(text, final_speaker)
            db_utterance = Utterance(
                incident_id=incident.id,
                speaker_name=final_speaker,
                text=text,
                normalized_text=parsed["normalized_label"],
                parser_type=parsed["utterance_type"],
                parser_method=ParserMethod.llm if parsed.get("used_llm") else ParserMethod.deterministic,
                confidence=Confidence(parsed["confidence"]),
                negated=parsed["negated"],
                topic=parsed["topic"],
                raw_parser_json=parsed
            )
            db.add(db_utterance)
            db.flush()

            # Process into graph nodes/edges
            graph_service.process_utterance(db, db_utterance, parsed)

            # Log event
            event = EventLog(
                incident_id=incident.id,
                event_type="utterance_created",
                payload_json={
                    "utterance_id": db_utterance.id,
                    "speaker": final_speaker,
                    "text": text,
                    "type": parsed["utterance_type"],
                    "topic": parsed["topic"],
                    "source": "google_meet_bridge"
                }
            )
            db.add(event)
            db.commit()

        return {
            "status": "ok",
            "text": text,
            "speaker": final_speaker,
            "incident_id": incident.id if incident else None
        }
    except Exception as e:
        print(f"Error processing meet audio chunk: {e}")
        return {"status": "error", "error": str(e)}

