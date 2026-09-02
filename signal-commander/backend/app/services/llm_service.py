import httpx
import json
from typing import Optional, Dict, Any
from ..config import settings


class LLMService:
    """
    LLM service for utterance classification and grounded query answering.
    Only used when deterministic parser fails or for open-ended queries.
    Gracefully degrades if LLM not configured.
    """
    
    def __init__(self):
        self.enabled = settings.llm_enabled
        self.base_url = settings.llm_base_url
        self.api_key = settings.llm_api_key
        self.model = settings.llm_model
    
    def classify_utterance(self, text: str, speaker: str) -> Optional[Dict[str, Any]]:
        """Classify utterance using LLM. Returns None on failure."""
        if not self.enabled:
            return None
        
        system_prompt = """You are an utterance classifier for incident management.
Classify the utterance into exactly one type: fact, hypothesis, decision, action, question, off_topic.
Return ONLY valid JSON with these fields:
- utterance_type: one of fact|hypothesis|decision|action|question|off_topic
- topic: one of db|cache|api|deployment|monitoring|payments|general
- negated: boolean
- confidence: high|medium|low
- normalized_label: string (cleaned version of the utterance)

Do not include any other text."""
        
        try:
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Classify: {text}"}
                    ],
                    "temperature": 0,
                    "max_tokens": 150
                },
                timeout=8.0
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            llm_data = json.loads(content.strip())
            
            required = ["utterance_type", "topic", "negated", "confidence", "normalized_label"]
            if all(k in llm_data for k in required):
                return {
                    "utterance_type": llm_data["utterance_type"],
                    "topic": llm_data.get("topic", "general"),
                    "negated": llm_data.get("negated", False),
                    "confidence": llm_data.get("confidence", "low"),
                    "normalized_label": llm_data["normalized_label"],
                    "parser_method": "llm",
                }
        except Exception:
            pass
        
        return None
    
    def answer_query(self, query: str, context: str) -> Optional[Dict[str, Any]]:
        """
        Answer a query using only the provided context.
        Returns JSON with answer and source_node_ids.
        """
        if not self.enabled:
            return None
        
        system_prompt = """You are an incident query assistant.
Answer questions using ONLY the information provided in the context.
If the answer cannot be found in the context, say so honestly.
Return ONLY valid JSON with these fields:
- answer: string (your response)
- source_node_ids: array of strings (IDs of nodes that support your answer)

Do not include any other text. Do not make up information."""
        
        try:
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Context:\n{context}\n\nQuery: {query}"}
                    ],
                    "temperature": 0,
                    "max_tokens": 500
                },
                timeout=8.0
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            llm_data = json.loads(content.strip())
            
            if "answer" in llm_data and "source_node_ids" in llm_data:
                return {
                    "answer": llm_data["answer"],
                    "source_node_ids": llm_data["source_node_ids"],
                    "answer_method": "grounded_llm",
                }
        except Exception:
            pass
        
        return None


llm_service = LLMService()
