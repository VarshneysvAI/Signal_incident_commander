from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import IncidentStatus
from ..schemas import HealthResponse
from ..config import settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    db_status = "ok"
    try:
        db.execute("SELECT 1")
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    llm_status = "configured" if settings.llm_enabled else "disabled (no API key)"
    agora_status = "configured" if settings.agora_enabled else "disabled (no credentials)"
    slack_status = "configured" if settings.slack_enabled else "disabled (no webhook)"
    
    return HealthResponse(
        status="ok",
        database=db_status,
        llm=llm_status,
        agora=agora_status,
        slack=slack_status
    )
