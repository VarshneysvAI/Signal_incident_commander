"""
Follow-ups API - Get overdue actions and follow-up status
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from app.db import get_db
from app.models import Incident, ActionItem
from app.schemas import ActionStatus
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/incidents/{incident_id}/followups", tags=["followups"])


class FollowupItem(BaseModel):
    id: str
    label: str
    proposed_owner: str | None
    confirmed_owner: str | None
    status: str
    age_minutes: float
    created_at: datetime
    
    class Config:
        from_attributes = True


@router.get("", response_model=List[FollowupItem])
def get_followups(incident_id: str, db: Session = Depends(get_db)):
    """Get all stale/follow-up actions for an incident"""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Get actions older than 5 minutes that are pending or committed
    cutoff = datetime.utcnow() - timedelta(minutes=5)
    
    stale_actions = db.query(ActionItem).filter(
        ActionItem.incident_id == incident_id,
        ActionItem.status.in_([
            ActionStatus.pending_owner_confirmation,
            ActionStatus.committed,
            ActionStatus.in_progress
        ]),
        ActionItem.created_at < cutoff
    ).all()
    
    return stale_actions
