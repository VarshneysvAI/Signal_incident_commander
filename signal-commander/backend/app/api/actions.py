from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..db import get_db
from ..models import ActionItem, EventLog, ActionStatus
from ..schemas import ActionItemSchema, ActionConfirmRequest

router = APIRouter()


@router.get("/incidents/{incident_id}/actions", response_model=List[ActionItemSchema])
def list_actions(incident_id: str, db: Session = Depends(get_db)):
    """List all action items for an incident."""
    actions = db.query(ActionItem).filter(
        ActionItem.incident_id == incident_id
    ).order_by(ActionItem.created_at.asc()).all()
    
    return [ActionItemSchema.model_validate(a) for a in actions]


@router.post("/actions/{action_id}/confirm", response_model=ActionItemSchema)
def confirm_action(action_id: int, confirm_req: ActionConfirmRequest, db: Session = Depends(get_db)):
    """Confirm action ownership."""
    action = db.query(ActionItem).filter(ActionItem.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    action.confirmed_owner = confirm_req.owner_name
    action.status = ActionStatus.committed
    
    # Log event
    db.add(EventLog(
        incident_id=action.incident_id,
        event_type="action_updated",
        payload_json={
            "action_id": action_id,
            "owner": confirm_req.owner_name,
            "status": "committed"
        }
    ))
    
    db.commit()
    db.refresh(action)
    
    return action


@router.post("/actions/{action_id}/reject", response_model=ActionItemSchema)
def reject_action(action_id: int, db: Session = Depends(get_db)):
    """Reject an action item."""
    action = db.query(ActionItem).filter(ActionItem.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    action.status = ActionStatus.rejected
    
    # Log event
    db.add(EventLog(
        incident_id=action.incident_id,
        event_type="action_updated",
        payload_json={
            "action_id": action_id,
            "status": "rejected"
        }
    ))
    
    db.commit()
    db.refresh(action)
    
    return action
