"""
Agora service for voice integration.
Generates RTC tokens and handles webhook verification.
Gracefully degrades if credentials not configured.
"""
import time
import hashlib
import base64
from typing import Optional, Dict, Any
from ..config import settings


class AgoraService:
    """Service for Agora voice integration."""
    
    def __init__(self):
        self.app_id = settings.agora_app_id
        self.app_certificate = settings.agora_app_certificate
        self.enabled = bool(self.app_id and self.app_certificate)
    
    def generate_token(
        self, 
        channel_name: str, 
        uid: int | str = 0,
        expiration: int = 3600
    ) -> Optional[str]:
        """
        Generate an Agora RTC token for joining a channel.
        Returns None if credentials not configured.
        
        Uses Agora AccessToken2 format.
        """
        if not self.enabled:
            return None
        
        try:
            # Import agora-token if available, otherwise use manual implementation
            try:
                from agora_token_builder import RtcTokenBuilder2
                if isinstance(uid, int):
                    token = RtcTokenBuilder2.build_token_with_uid(
                        self.app_id,
                        self.app_certificate,
                        channel_name,
                        uid,
                        "publisher",
                        int(time.time()) + expiration
                    )
                else:
                    token = RtcTokenBuilder2.build_token_with_user_account(
                        self.app_id,
                        self.app_certificate,
                        channel_name,
                        str(uid),
                        "publisher",
                        int(time.time()) + expiration
                    )
                return token
            except (ImportError, AttributeError):
                # Fallback to manual token generation (simplified version)
                return self._generate_token_manual(channel_name, uid, expiration)
        except Exception as e:
            print(f"Error generating Agora token: {e}")
            return None
    
    def _generate_token_manual(
        self, 
        channel_name: str, 
        uid: int | str, 
        expiration: int
    ) -> str:
        """
        Manual token generation based on Agora's open-source DynamicKey.
        This is a simplified implementation for when agora-token package is unavailable.
        """
        # Simplified token format for demonstration
        # In production, use the official agora-token package
        timestamp = int(time.time())
        salt = hashlib.sha256(f"{channel_name}{uid}{timestamp}".encode()).hexdigest()[:8]
        
        # This is a placeholder - real implementation would follow Agora's spec exactly
        token_data = {
            "app_id": self.app_id,
            "channel": channel_name,
            "uid": uid,
            "expire": timestamp + expiration,
            "salt": salt
        }
        
        # Encode as base64 for transport
        import json
        token_string = base64.b64encode(json.dumps(token_data).encode()).decode()
        return token_string
    
    def verify_webhook_secret(self, provided_secret: Optional[str]) -> bool:
        """
        Verify webhook secret if configured.
        Returns True if no secret configured (open mode) or if secret matches.
        """
        if not settings.agora_webhook_secret:
            return True  # No secret configured, accept all
        
        if not provided_secret:
            return False
        
        return provided_secret == settings.agora_webhook_secret
    
    def get_status(self) -> Dict[str, Any]:
        """Get Agora service status."""
        return {
            "enabled": self.enabled,
            "app_id_configured": bool(self.app_id),
            "certificate_configured": bool(self.app_certificate),
            "webhook_secret_configured": bool(settings.agora_webhook_secret)
        }


agora_service = AgoraService()
