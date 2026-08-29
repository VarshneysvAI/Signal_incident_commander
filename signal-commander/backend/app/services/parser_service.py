import re
from typing import Dict, Any, Optional, Tuple
from ..config import settings


class ParserService:
    """
    Utterance parser with deterministic patterns and LLM fallback.
    Pipeline: normalize → deterministic patterns → negation → topic → owner → confidence → LLM fallback
    """
    
    # Deterministic patterns (order matters - first match wins)
    FACT_PATTERNS = [
        r"metrics?\s+(show|indicate|confirm)",
        r"logs?\s+(show|indicate|confirm)",
        r"we verified",
        r"we checked",
        r"data shows",
        r"confirmed",
        r"alert shows",
    ]
    
    HYPOTHESIS_PATTERNS = [
        r"i think",
        r"maybe",
        r"probably",
        r"could be",
        r"might be",
        r"my theory is",
        r"i suspect",
        r"seems like",
    ]
    
    DECISION_PATTERNS = [
        r"let'?s",
        r"we (should|will|decided)",
        r"i propose",
        r"the plan is",
        r"we agree(d)?",
    ]
    
    ACTION_PATTERNS = [
        r"(i|\w+) (will|can) (handle|take|fix|do)",
        r"assign(ed)?( to)? \w+",
        r"(working on|looking into|investigating)",
    ]
    
    QUESTION_PATTERNS = [
        r"\?$",
        r"^(what|why|how|who|when|where) ",
        r"^(can|could) (we|you)",
    ]
    
    NEGATION_WORDS = [
        "not", "no", "never", "don't", "do not", "isn't", "is not",
        "wasn't", "was not", "can't", "cannot", "shouldn't", "should not"
    ]
    
    TOPIC_KEYWORDS = {
        "db": ["database", "db", "postgres", "mysql", "sql"],
        "cache": ["cache", "redis", "memcached"],
        "api": ["api", "endpoint", "request", "response", "status code"],
        "deployment": ["deploy", "deployment", "rollback", "release", "version"],
        "monitoring": ["metrics", "logs", "alert", "dashboard", "grafana", "datadog"],
        "payments": ["payment", "checkout", "billing"],
    }
    
    POLARITY_NEGATIVE = ["down", "failing", "failure", "timeout", "timeouts", "spiking", "locked", "broken", "outage"]
    POLARITY_POSITIVE = ["healthy", "green", "fine", "normal", "ok", "stable"]
    
    def normalize(self, text: str) -> str:
        """Normalize text: lowercase, collapse spaces."""
        return ' '.join(text.lower().split())
    
    def detect_negation(self, text: str, match_start: int, match_end: int) -> bool:
        """Check if negation word appears within 4 tokens before matched keyword."""
        words_before = text[:match_start].split()[-4:]
        return any(neg in ' '.join(words_before).lower() for neg in self.NEGATION_WORDS)
    
    def detect_topic(self, text: str) -> str:
        """Detect topic from keywords. Returns first matching group or 'general'."""
        text_lower = text.lower()
        for topic, keywords in self.TOPIC_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text_lower:
                    return topic
        return "general"
    
    def detect_polarity(self, text: str) -> Optional[str]:
        """Detect polarity: positive, negative, or None."""
        text_lower = text.lower()
        has_negative = any(word in text_lower for word in self.POLARITY_NEGATIVE)
        has_positive = any(word in text_lower for word in self.POLARITY_POSITIVE)
        
        if has_negative and not has_positive:
            return "negative"
        elif has_positive and not has_negative:
            return "positive"
        return None
    
    def extract_owner(self, text: str, speaker: str) -> Tuple[Optional[str], str]:
        """
        Extract action owner.
        Returns (owner, status): 
        - owner=speaker → "committed"
        - owner=third party → "pending_owner_confirmation"
        - owner=None → "unassigned"
        """
        text_lower = text.lower()
        
        # "i will" / "i can" → speaker
        if re.search(r'\bi\s+(will|can)\b', text_lower):
            return speaker, "committed"
        
        # "(\w+) will (take|handle|fix)" → captured name
        match = re.search(r'(\w+)\s+(will|can)\s+(take|handle|fix)', text_lower)
        if match:
            owner = match.group(1).title()
            if owner.lower() == speaker.lower():
                return owner, "committed"
            return owner, "pending_owner_confirmation"
        
        # "assign(ed)? to (\w+)" → captured name
        match = re.search(r'assign(?:ed)?\s+to\s+(\w+)', text_lower)
        if match:
            owner = match.group(1).title()
            if owner.lower() == speaker.lower():
                return owner, "committed"
            return owner, "pending_owner_confirmation"
        
        return None, "unassigned"
    
    def match_pattern(self, text: str) -> Optional[Tuple[str, str, int, int]]:
        """
        Match deterministic patterns in order: fact, hypothesis, decision, action, question.
        Returns (type, pattern, match_start, match_end) or None.
        """
        patterns = [
            ("fact", self.FACT_PATTERNS),
            ("hypothesis", self.HYPOTHESIS_PATTERNS),
            ("decision", self.DECISION_PATTERNS),
            ("action", self.ACTION_PATTERNS),
            ("question", self.QUESTION_PATTERNS),
        ]
        
        for ptype, pattern_list in patterns:
            for pattern in pattern_list:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    return (ptype, pattern, match.start(), match.end())
        
        return None
    
    def parse(self, text: str, speaker: str) -> Dict[str, Any]:
        """
        Parse utterance and return structured result.
        """
        normalized = self.normalize(text)
        
        # Try deterministic patterns
        match_result = self.match_pattern(normalized)
        
        if match_result:
            ptype, pattern, match_start, match_end = match_result
            negated = self.detect_negation(normalized, match_start, match_end)
            topic = self.detect_topic(normalized)
            polarity = self.detect_polarity(normalized)
            
            # Determine confidence
            confidence = "high" if topic != "general" else "medium"
            
            # Extract owner for actions
            owner = None
            action_status = None
            if ptype == "action":
                owner, action_status = self.extract_owner(normalized, speaker)
            
            # Create label
            label = normalized
            if negated:
                label = f"[REJECTED] {normalized}"
            
            result = {
                "utterance_type": ptype,
                "topic": topic,
                "negated": negated,
                "confidence": confidence,
                "normalized_label": label,
                "polarity": polarity,
                "proposed_owner": owner,
                "action_status": action_status,
                "parser_method": "deterministic",
            }
            
            # Check if we should use LLM fallback for uncertain cases
            # (Currently only if no pattern matched - could extend to low confidence)
            return result
        
        # No pattern matched → uncertain
        result = {
            "utterance_type": "uncertain",
            "topic": "general",
            "negated": False,
            "confidence": "uncertain",
            "normalized_label": normalized,
            "polarity": None,
            "proposed_owner": None,
            "action_status": "unassigned",
            "parser_method": "deterministic",
        }
        
        # Try LLM fallback if configured
        if settings.llm_enabled:
            llm_result = self._llm_classify(text, speaker)
            if llm_result:
                result = llm_result
        
        return result
    
    def _llm_classify(self, text: str, speaker: str) -> Optional[Dict[str, Any]]:
        """Classify utterance using LLM. Only called when deterministic parser fails."""
        import httpx
        import json
        
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
                f"{settings.llm_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.llm_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": settings.llm_model,
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
            
            # Parse JSON response
            llm_data = json.loads(content.strip())
            
            # Validate required fields
            required = ["utterance_type", "topic", "negated", "confidence", "normalized_label"]
            if all(k in llm_data for k in required):
                owner = None
                action_status = "unassigned"
                if llm_data["utterance_type"] == "action":
                    owner, action_status = self.extract_owner(text, speaker)
                
                return {
                    "utterance_type": llm_data["utterance_type"],
                    "topic": llm_data.get("topic", "general"),
                    "negated": llm_data.get("negated", False),
                    "confidence": llm_data.get("confidence", "low"),
                    "normalized_label": llm_data["normalized_label"],
                    "polarity": None,
                    "proposed_owner": owner,
                    "action_status": action_status,
                    "parser_method": "llm",
                }
        except Exception:
            pass  # Fall through to uncertain
        
        return None


parser_service = ParserService()
