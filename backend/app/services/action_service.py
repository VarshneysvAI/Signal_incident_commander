from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from ..models import ActionItem, GraphNode, EventLog
from ..schemas import ActionItemCreate, ActionItemUpdate


class ActionService:
    """
    Service for managing action items with human confirmation workflow.
    """
    
    def create_action(
        self, 
        db: Session, 
        incident_id: str, 
        label: str, 
        proposed_owner: Optional[str],
        source_utterance_id: int
    ) -> ActionItem:
        """Create a new action item."""
        
        # Determine initial status based on owner assignment
        if not proposed_owner:
            status = "unassigned"
        elif proposed_owner.lower() == "i":  # Self-assignment from "I will..."
            status = "committed"
        else:
            status = "pending_owner_confirmation"
        
        action = ActionItem(
            incident_id=incident_id,
            label=label,
            proposed_owner=proposed_owner,
            confirmed_owner=None,
            status=status,
            source_utterance_id=source_utterance_id,
        )
        
        db.add(action)
        db.commit()
        db.refresh(action)
        
        # Log event
        event = EventLog(
            incident_id=incident_id,
            event_type="action_created",
            payload_json={
                "action_id": action.id,
                "label": label,
                "owner": proposed_owner,
                "status": status,
            }
        )
        db.add(event)
        db.commit()
        
        return action
    
    def confirm_owner(
        self, 
        db: Session, 
        action_id: int, 
        owner_name: str
    ) -> Optional[ActionItem]:
        """Confirm action owner (human confirmation gate)."""
        action = db.query(ActionItem).filter(ActionItem.id == action_id).first()
        if not action:
            return None
        
        action.confirmed_owner = owner_name
        action.status = "committed"
        
        db.commit()
        db.refresh(action)
        
        # Log event
        event = EventLog(
            incident_id=action.incident_id,
            event_type="action_updated",
            payload_json={
                "action_id": action.id,
                "confirmed_owner": owner_name,
                "status": "committed",
            }
        )
        db.add(event)
        db.commit()
        
        return action
    
    def reject_action(
        self, 
        db: Session, 
        action_id: int
    ) -> Optional[ActionItem]:
        """Reject an action item."""
        action = db.query(ActionItem).filter(ActionItem.id == action_id).first()
        if not action:
            return None
        
        action.status = "rejected"
        
        db.commit()
        db.refresh(action)
        
        # Log event
        event = EventLog(
            incident_id=action.incident_id,
            event_type="action_updated",
            payload_json={
                "action_id": action.id,
                "status": "rejected",
            }
        )
        db.add(event)
        db.commit()
        
        return action
    
    def update_status(
        self, 
        db: Session, 
        action_id: int, 
        status: str
    ) -> Optional[ActionItem]:
        """Update action status (e.g., in_progress, completed)."""
        valid_statuses = ["unassigned", "pending_owner_confirmation", "committed", "in_progress", "completed", "rejected"]
        if status not in valid_statuses:
            return None
        
        action = db.query(ActionItem).filter(ActionItem.id == action_id).first()
        if not action:
            return None
        
        action.status = status
        
        db.commit()
        db.refresh(action)
        
        # Log event
        event = EventLog(
            incident_id=action.incident_id,
            event_type="action_updated",
            payload_json={
                "action_id": action.id,
                "status": status,
            }
        )
        db.add(event)
        db.commit()
        
        return action
    
    def get_actions_by_incident(
        self, 
        db: Session, 
        incident_id: str
    ) -> List[ActionItem]:
        """Get all actions for an incident."""
        return db.query(ActionItem).filter(ActionItem.incident_id == incident_id).all()
    
    def detect_ownership_conflict(
        self, 
        db: Session, 
        incident_id: str, 
        label_keyword: str,
        new_owner: str
    ) -> List[ActionItem]:
        """Detect if there's an ownership conflict for similar actions."""
        # Find existing actions with overlapping keywords but different owners
        existing_actions = db.query(ActionItem).filter(
            ActionItem.incident_id == incident_id,
            ActionItem.label.ilike(f"%{label_keyword}%"),
            ActionItem.proposed_owner != new_owner,
            ActionItem.status.not_in(["rejected", "completed"])
        ).all()
        
        return existing_actions


action_service = ActionService()
