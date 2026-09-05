from fastapi import APIRouter, Depends, Request
from starlette.responses import StreamingResponse
import asyncio
import json
from ..db import SessionLocal
from ..models import EventLog

router = APIRouter()


@router.get("/incidents/{incident_id}/events")
async def stream_events(incident_id: str, request: Request):
    """SSE endpoint for real-time event streaming."""
    async def event_generator():
        last_seen_id = 0
        
        # Initial burst of existing events
        db = SessionLocal()
        try:
            initial_events = db.query(EventLog).filter(
                EventLog.incident_id == incident_id
            ).order_by(EventLog.id.asc()).all()
            
            for event in initial_events:
                last_seen_id = max(last_seen_id, event.id)
                data = {
                    "id": event.id,
                    "incident_id": event.incident_id,
                    "event_type": event.event_type,
                    "payload": event.payload_json,
                    "payload_json": event.payload_json,
                    "created_at": event.created_at.isoformat() if event.created_at else None
                }
                yield f"data: {json.dumps(data)}\n\n"
        finally:
            db.close()
            
        # Continuous loop for new events
        ping_counter = 0
        while True:
            if await request.is_disconnected():
                break
                
            db = SessionLocal()
            try:
                new_events = db.query(EventLog).filter(
                    EventLog.incident_id == incident_id,
                    EventLog.id > last_seen_id
                ).order_by(EventLog.id.asc()).all()
                
                for event in new_events:
                    last_seen_id = max(last_seen_id, event.id)
                    data = {
                        "id": event.id,
                        "incident_id": event.incident_id,
                        "event_type": event.event_type,
                        "payload": event.payload_json,
                        "payload_json": event.payload_json,
                        "created_at": event.created_at.isoformat() if event.created_at else None
                    }
                    yield f"data: {json.dumps(data)}\n\n"
            finally:
                db.close()
                
            ping_counter += 1
            if ping_counter >= 15:
                yield ": ping\n\n"
                ping_counter = 0
                
            await asyncio.sleep(0.8)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

