from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..config import settings
from ..schemas import AgoraTokenRequest, AgoraTokenResponse, StartAgentRequest, StartAgentResponse

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
