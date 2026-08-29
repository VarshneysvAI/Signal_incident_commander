from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import EventLog
from ..schemas import IncidentCreate, IncidentResponse

router = APIRouter()


@router.get("/incidents/{incident_id}/events")
def stream_events(incident_id: str, db: Session = Depends(get_db)):
    """SSE endpoint for real-time event streaming."""
    from starlette.responses import StreamingResponse
    import json
    
    async def event_generator():
        # Get all events for this incident
        events = db.query(EventLog).filter(
            EventLog.incident_id == incident_id
        ).order_by(EventLog.created_at.asc()).all()
        
        for event in events:
            data = {
                "id": event.id,
                "event_type": event.event_type,
                "payload": event.payload_json,
                "created_at": event.created_at.isoformat() if event.created_at else None
            }
            yield f"data: {json.dumps(data)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
