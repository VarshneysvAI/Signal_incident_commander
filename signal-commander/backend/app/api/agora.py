from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..config import settings
from ..schemas import AgoraTokenRequest, AgoraTokenResponse

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
            uid=token_req.uid
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}")
