from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./signal.db"
    
    # LLM
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    llm_model: str = "gpt-4o-mini"

    def model_post_init(self, __context) -> None:
        if not self.llm_api_key and self.openai_api_key:
            self.llm_api_key = self.openai_api_key

    @property
    def llm_enabled(self) -> bool:
        return self.llm_api_key is not None and len(self.llm_api_key) > 0
    
    # Agora
    agora_app_id: Optional[str] = None
    agora_app_certificate: Optional[str] = None
    agora_webhook_secret: Optional[str] = None
    
    @property
    def agora_enabled(self) -> bool:
        return (
            self.agora_app_id is not None 
            and len(self.agora_app_id) > 0
            and self.agora_app_certificate is not None
            and len(self.agora_app_certificate) > 0
        )
    
    # Slack
    slack_webhook_url: Optional[str] = None
    
    @property
    def slack_enabled(self) -> bool:
        return self.slack_webhook_url is not None and len(self.slack_webhook_url) > 0
    
    # Follow-up Service
    followup_scan_seconds: int = 60
    followup_stale_minutes: int = 5
    
    # Audio Bridge (CR-1)
    audio_bridge_enabled: bool = True
    presenter_name: str = "Presenter"
    
    # Email Notifications
    notification_email: Optional[str] = None
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: str = "signal-incident-commander@noreply.com"
    smtp_use_tls: bool = True
    
    @property
    def email_enabled(self) -> bool:
        return (
            self.smtp_user is not None
            and len(self.smtp_user) > 0
            and self.smtp_password is not None
            and len(self.smtp_password) > 0
        )
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
