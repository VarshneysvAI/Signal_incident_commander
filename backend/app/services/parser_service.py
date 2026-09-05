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
        r"is (the issue|the problem|failing|broken|down)",
        r"\w+ (is|are) (the issue|the problem|failing|broken|down)",
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
        r"assign(?:ed)?\s+(?:this\s+)?(?:to\s+)?(\w+)",
        r"(working on|looking into|investigating)",
        r"\b(\w+)\s+please\s+(restart|handle|take|fix|do|check|investigate|rollback|run)",
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
        # Get words before the match (up to 4 tokens)
        words_before = text[:match_start].split()[-4:]
        text_window = ' '.join(words_before).lower()
        
        # Check for negation words in the window
        for neg in self.NEGATION_WORDS:
            if neg in text_window:
                return True
        
        # Also check if negation appears anywhere in the full text near key decision/hypothesis markers
        # This handles cases like "should NOT" where NOT comes after the verb
        words = text.split()
        for i, word in enumerate(words):
            if word.lower() in self.NEGATION_WORDS or word.lower().rstrip('.,!?') in self.NEGATION_WORDS:
                return True
        
        return False
    
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
        
        # "assign(ed)? (this)? (to)? (\w+)" → captured name from pattern
        match = re.search(r'assign(?:ed)?\s+(?:this\s+)?(?:to\s+)?(\w+)', text_lower)
        if match:
            owner_candidate = match.group(1).title()
            # Skip common words that aren't names
            if owner_candidate.lower() in ['this', 'that', 'it']:
                return None, "unassigned"
            if owner_candidate.lower() == speaker.lower():
                return owner_candidate, "committed"
            return owner_candidate, "pending_owner_confirmation"
        
        # "(\w+) please (restart|handle|fix|...)"
        match = re.search(r'\b(\w+)\s+please\b', text_lower)
        if match:
            owner_candidate = match.group(1).title()
            if owner_candidate.lower() not in ['can', 'could', 'will', 'you', 'someone', 'all']:
                if owner_candidate.lower() == speaker.lower():
                    return owner_candidate, "committed"
                return owner_candidate, "pending_owner_confirmation"
        
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
        When LLM is configured, uses semantic open-world classification to handle any incident domain.
        Falls back to deterministic regex patterns for zero-downtime offline reliability.
        """
        normalized = self.normalize(text)
        
        # 1. Primary: LLM semantic intelligence if credentials configured
        if settings.llm_enabled:
            llm_result = self._llm_classify(text, speaker)
            if llm_result:
                return llm_result
        
        # 2. Fallback: Fast deterministic patterns
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
            
            return {
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
        
        # No pattern matched → uncertain
        return {
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
    
    def _llm_classify(self, text: str, speaker: str) -> Optional[Dict[str, Any]]:
        """
        Classify utterance using LLM with open-world engineering domain extraction.
        Handles arbitrary production incidents (Kubernetes, AWS/Cloud, Networking, Databases, Auth, Queues, etc.).
        """
        import httpx
        import json
        
        system_prompt = f"""You are SIGNAL, an expert Site Reliability Engineer and AI Incident Commander.
Analyze the following war-room utterance spoken by "{speaker}" in an active production incident.

Determine the exact incident classification:
1. "fact" - Confirmed observations, alert data, logs, metrics, telemetry, or verified reality (e.g. "504 gateway timeout on /checkout", "CPU at 98%", "pod CrashLoopBackOff", "disk /var is 100% full").
2. "hypothesis" - Root-cause theories, suspected culprits, or speculative guesses (e.g. "I think the connection pool is exhausted", "could be bad BGP route", "maybe memory leak in worker").
3. "decision" - Strategic consensus, architectural agreement, or chosen mitigation strategy (e.g. "let's failover to us-west-2", "we agreed to rollback deploy v2.4", "plan is to block that IP").
4. "action" - A specific operational task being assigned, volunteered, or scheduled (e.g. "Sarah please bounce the ingress", "I will drain node 4", "who can check Datadog?").
5. "question" - An inquiry requesting information or status (e.g. "what is the current error rate?", "who deployed this morning?").
6. "off_topic" - Non-incident conversation, greetings, jokes, or idle chatter.

Return ONLY raw JSON with these fields:
{{
  "utterance_type": "fact" | "hypothesis" | "decision" | "action" | "question" | "off_topic",
  "topic": "<specific technical domain: e.g. kubernetes, database, networking, dns, auth, cache, deployment, payment, storage, monitoring, security, or general>",
  "negated": <true if statement rules out, rejects, or refutes something (e.g. "DB is NOT the issue", "do NOT restart that"), else false>,
  "confidence": "high" | "medium" | "low",
  "normalized_label": "<crisp, professional summary statement suitable for a knowledge graph node>",
  "proposed_owner": "<name of person volunteering or assigned for actions, else null>",
  "action_status": "<committed if speaker says they will do it; pending_owner_confirmation if asking someone else; unassigned; or null>"
}}"""
        
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
                        {"role": "user", "content": f"Speaker: {speaker}\nUtterance: {text}"}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 200
                },
                timeout=5.0
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()
            
            # Remove markdown code block fences if present
            if content.startswith("```"):
                lines = content.splitlines()
                content = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
            
            llm_data = json.loads(content)
            
            # Validate required fields
            required = ["utterance_type", "topic", "negated", "confidence", "normalized_label"]
            if all(k in llm_data for k in required):
                owner = llm_data.get("proposed_owner")
                action_status = llm_data.get("action_status")
                
                # Fallback to regex owner extraction if LLM didn't catch owner
                if llm_data["utterance_type"] == "action" and not owner:
                    owner, action_status = self.extract_owner(text, speaker)
                
                return {
                    "utterance_type": llm_data["utterance_type"],
                    "topic": llm_data.get("topic", "general").lower(),
                    "negated": bool(llm_data.get("negated", False)),
                    "confidence": llm_data.get("confidence", "high"),
                    "normalized_label": llm_data["normalized_label"],
                    "polarity": None,
                    "proposed_owner": owner,
                    "action_status": action_status or "unassigned",
                    "parser_method": "llm",
                }
        except Exception as e:
            pass  # Fall through to deterministic parser
        
        return None


parser_service = ParserService()
