"""
Follow-up Service - Scans for stale actions and sends reminders
"""
import asyncio
from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models import ActionItem, EventLog, Incident
from app.schemas import ActionStatus
from app.config import settings


class FollowUpService:
    def __init__(self, db: Session):
        self.db = db
    
    def get_stale_actions(self, stale_minutes: int = 5) -> List[ActionItem]:
        """Find actions that are pending or committed but old enough to need follow-up"""
        cutoff = datetime.utcnow() - timedelta(minutes=stale_minutes)
        
        stale = self.db.query(ActionItem).join(Incident).filter(
            ActionItem.status.in_([
                ActionStatus.pending_owner_confirmation,
                ActionStatus.committed,
                ActionStatus.in_progress
            ]),
            ActionItem.created_at < cutoff,
            Incident.status == "active"
        ).all()
        
        return stale
    
    def has_recent_reminder(self, action_id: str, minutes: int = 10) -> bool:
        """Check if a reminder was sent recently"""
        recent = self.db.query(EventLog).filter(
            EventLog.event_type == "followup_due",
            EventLog.incident_id == ActionItem.incident_id,
            EventLog.created_at > datetime.utcnow() - timedelta(minutes=minutes)
        ).first()
        
        return recent is not None
    
    def create_followup_event(self, action: ActionItem):
        """Create a followup event log"""
        payload = {
            "action_id": action.id,
            "action_label": action.label,
            "owner": action.confirmed_owner or action.proposed_owner,
            "status": action.status.value,
            "age_minutes": (datetime.utcnow() - action.created_at).total_seconds() / 60,
            "incident_id": action.incident_id
        }
        
        event = EventLog(
            incident_id=action.incident_id,
            event_type="followup_due",
            payload_json=payload
        )
        
        self.db.add(event)
        self.db.commit()
        
        return event
    
    async def scan_and_notify(self, stale_minutes: int = 5, reminder_interval: int = 10):
        """Scan for stale actions and send notifications"""
        from app.services.integration_service import IntegrationService
        
        stale_actions = self.get_stale_actions(stale_minutes)
        
        for action in stale_actions:
            # Skip if recently reminded
            if self.has_recent_reminder(action.id, reminder_interval):
                continue
            
            # Create event log
            event = self.create_followup_event(action)
            
            # Send Slack notification if configured
            if settings.SLACK_WEBHOOK_URL:
                integration = IntegrationService(self.db)
                owner_name = action.confirmed_owner or action.proposed_owner or "Someone"
                
                message = (
                    f"🔔 *Action Follow-up*\n"
                    f"*Task:* {action.label}\n"
                    f"*Owner:* {owner_name}\n"
                    f"*Status:* {action.status.value}\n"
                    f"*Age:* {(datetime.utcnow() - action.created_at).total_seconds() / 60:.0f} minutes\n"
                    f"\nPlease provide an update on this action item."
                )
                
                await integration.send_slack_message(message)


# Background task manager
followup_task: Optional[asyncio.Task] = None


async def start_followup_worker(db_session_factory):
    """Start the background follow-up scanning worker"""
    global followup_task
    
    async def worker():
        while True:
            try:
                db = db_session_factory()
                service = FollowUpService(db)
                await service.scan_and_notify(
                    stale_minutes=settings.FOLLOWUP_STALE_MINUTES,
                    reminder_interval=10
                )
                db.close()
            except Exception as e:
                print(f"Follow-up worker error: {e}")
            
            await asyncio.sleep(settings.FOLLOWUP_SCAN_SECONDS)
    
    followup_task = asyncio.create_task(worker())
    return followup_task


async def stop_followup_worker():
    """Stop the background worker"""
    global followup_task
    if followup_task:
        followup_task.cancel()
        try:
            await followup_task
        except asyncio.CancelledError:
            pass
        followup_task = None
