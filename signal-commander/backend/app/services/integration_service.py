import httpx
from typing import Optional, Dict, Any
from ..config import settings


class IntegrationService:
    """
    Service for external integrations (Slack, etc.).
    All integrations require human confirmation before execution.
    Gracefully degrades if credentials not configured.
    """
    
    def __init__(self):
        self.slack_enabled = bool(settings.slack_webhook_url)
        self.slack_webhook_url = settings.slack_webhook_url
    
    async def send_slack_message(
        self, 
        message: str, 
        incident_title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send a message to Slack via webhook.
        Returns success status and response data.
        """
        if not self.slack_enabled:
            return {
                "success": False,
                "error": "Slack webhook URL not configured",
                "disabled": True
            }
        
        # Format message with incident context if provided
        formatted_message = message
        if incident_title:
            formatted_message = f"*{incident_title}*\n{message}"
        
        try:
            response = await httpx.post(
                self.slack_webhook_url,
                json={"text": formatted_message},
                timeout=10.0
            )
            response.raise_for_status()
            
            return {
                "success": True,
                "message": "Message sent to Slack",
                "disabled": False
            }
        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"HTTP error: {str(e)}",
                "disabled": False
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}",
                "disabled": False
            }
    
    async def notify_action_created(
        self,
        action_label: str,
        owner: Optional[str],
        incident_title: str
    ) -> Dict[str, Any]:
        """Notify when an action is created (requires human confirmation)."""
        owner_text = f"assigned to {owner}" if owner else "unassigned"
        message = f"🔔 New action created: '{action_label}' ({owner_text})"
        return await self.send_slack_message(message, incident_title)
    
    async def notify_contradiction(
        self,
        contradiction_description: str,
        incident_title: str
    ) -> Dict[str, Any]:
        """Notify when a contradiction is detected."""
        message = f"⚠️ Contradiction detected: {contradiction_description}"
        return await self.send_slack_message(message, incident_title)
    
    async def notify_incident_closed(
        self,
        incident_title: str,
        duration: str
    ) -> Dict[str, Any]:
        """Notify when an incident is closed."""
        message = f"✅ Incident closed: {incident_title} (Duration: {duration})"
        return await self.send_slack_message(message, incident_title)


integration_service = IntegrationService()
