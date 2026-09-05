from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Incident
from fastapi.responses import Response

router = APIRouter()


@router.get("/incidents/{incident_id}/export")
def export_incident(
    incident_id: str,
    format: str = Query(default="markdown", regex="^(markdown|json)$"),
    db: Session = Depends(get_db)
):
    """Export incident as Markdown or JSON."""
    from ..services.export_service import export_service
    
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if format == "markdown":
        content = export_service.generate_markdown(db, incident_id)
        return Response(
            content=content,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{incident_id}-incident.md"'}
        )
    else:  # json
        import json
        data = export_service.generate_json(db, incident_id)
        return Response(
            content=json.dumps(data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{incident_id}-incident.json"'}
        )


@router.post("/incidents/{incident_id}/send-email", response_model=dict)
def email_incident_report(
    incident_id: str,
    body: dict = None,
    db: Session = Depends(get_db)
):
    """Email the incident executive report to the configured recipient."""
    from ..services.email_service import email_service
    
    body = body or {}
    recipient = body.get("recipient_email")
    subject = body.get("subject")
    note = body.get("note")
    
    result = email_service.send_incident_report(
        db=db,
        incident_id=incident_id,
        recipient=recipient,
        subject=subject,
        note=note
    )
    
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
        
    return result
