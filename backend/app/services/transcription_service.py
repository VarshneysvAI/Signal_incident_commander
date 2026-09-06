"""
Audio transcription service for SIGNAL.
Transcribes audio streams from Google Meet / Zoom tab audio using Whisper API.
"""
import httpx
from typing import Optional, Dict, Any
from ..config import settings


class TranscriptionService:
    """Service to transcribe live audio chunks from Google Meet / Agora bridge."""

    def __init__(self):
        self.openai_key = settings.openai_api_key or (settings.llm_api_key if settings.llm_api_key and settings.llm_api_key.startswith("sk-") else None)
        self.nvidia_key = settings.nvidia_api_key

    async def transcribe_audio_chunk(
        self,
        audio_bytes: bytes,
        filename: str = "audio.webm",
        content_type: str = "audio/webm",
        language: str = "en"
    ) -> Optional[str]:
        """
        Transcribe audio bytes using OpenAI Whisper API or Groq/NVIDIA.
        Returns transcribed text or None.
        """
        if self.openai_key:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    files = {
                        "file": (filename, audio_bytes, content_type)
                    }
                    data = {
                        "model": "whisper-1",
                        "language": language,
                        "temperature": "0.0",
                        "response_format": "text"
                    }
                    headers = {
                        "Authorization": f"Bearer {self.openai_key}"
                    }
                    response = await client.post(
                        "https://api.openai.com/v1/audio/transcriptions",
                        headers=headers,
                        data=data,
                        files=files
                    )
                    if response.status_code == 200:
                        text = response.text.strip()
                        if text:
                            return text
                    else:
                        print(f"Whisper transcription returned HTTP {response.status_code}: {response.text}")
            except Exception as e:
                print(f"Whisper transcription error: {e}")

        if settings.llm_api_key and "gsk_" in settings.llm_api_key:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    files = {
                        "file": (filename, audio_bytes, content_type)
                    }
                    data = {
                        "model": "whisper-large-v3",
                        "language": language,
                        "temperature": "0.0",
                        "response_format": "text"
                    }
                    headers = {
                        "Authorization": f"Bearer {settings.llm_api_key}"
                    }
                    response = await client.post(
                        "https://api.groq.com/openai/v1/audio/transcriptions",
                        headers=headers,
                        data=data,
                        files=files
                    )
                    if response.status_code == 200:
                        return response.text.strip()
            except Exception as e:
                print(f"Groq Whisper transcription error: {e}")

        return None


transcription_service = TranscriptionService()
