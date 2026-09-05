import json
import re
import uuid
from typing import List, Dict, Any, Optional
import httpx
from ..config import settings


PREBUILT_SCENARIOS = {
    "payment_outage": {
        "id": "payment_outage",
        "title": "Global Checkout 504 Timeouts & Gateway Rate-Limiting",
        "severity": "P0 - Critical",
        "domain": "payments",
        "description": "Checkout failure across EU and US-East regions with conflicting database and gateway metrics.",
        "responders": [
            {"name": "Alice", "role": "Incident Commander / SRE Lead", "avatar": "👩‍💼", "uid": 1001},
            {"name": "Bob", "role": "Backend / DB Engineer", "avatar": "👨‍💻", "uid": 1002},
            {"name": "Carol", "role": "Core Banking Tech Lead", "avatar": "👩‍🔧", "uid": 1003},
            {"name": "Sarah", "role": "Payment Gateway SRE", "avatar": "👩‍💻", "uid": 1005},
            {"name": "Vikram", "role": "Principal Systems Architect", "avatar": "👨‍🔬", "uid": 1006},
        ],
        "utterances": [
            {
                "speaker": "Alice",
                "role": "Incident Commander",
                "text": "We verified that checkout API latency spiked to 4500ms after the v2.4 deploy.",
                "label": "Fact (API Latency)",
                "expected_type": "fact"
            },
            {
                "speaker": "Bob",
                "role": "Backend / DB Engineer",
                "text": "Maybe the database connection pool is completely exhausted.",
                "label": "Hypothesis (DB Pool)",
                "expected_type": "hypothesis"
            },
            {
                "speaker": "Carol",
                "role": "Core Banking Lead",
                "text": "The database metrics show 0% connection pool usage.",
                "label": "Contradicting Fact (DB OK)",
                "expected_type": "fact",
                "is_contradiction": True
            },
            {
                "speaker": "Sarah",
                "role": "Payment Gateway SRE",
                "text": "Data shows the upstream payment gateway partner is returning 504 gateway timeouts.",
                "label": "Fact (Upstream 504)",
                "expected_type": "fact"
            },
            {
                "speaker": "Vikram",
                "role": "Principal Architect",
                "text": "Bob, can you check and restart the payment gateway webhook worker?",
                "label": "Action Delegation (to Bob)",
                "expected_type": "action"
            },
            {
                "speaker": "Bob",
                "role": "Backend / DB Engineer",
                "text": "I will handle the payment gateway worker restart now.",
                "label": "Action Committed (Bob)",
                "expected_type": "action"
            },
            {
                "speaker": "Alice",
                "role": "Incident Commander",
                "text": "Signal, what is the current root cause hypothesis?",
                "label": "Wake-Word Status Query",
                "expected_type": "query"
            },
            {
                "speaker": "Vikram",
                "role": "Principal Architect",
                "text": "I propose we failover checkout traffic to the secondary Stripe gateway.",
                "label": "Decision Proposal (Failover)",
                "expected_type": "decision"
            },
            {
                "speaker": "Alice",
                "role": "Incident Commander",
                "text": "Let's roll back the deployment to v2.3 to restore service immediately.",
                "label": "Final Decision (Rollback)",
                "expected_type": "decision"
            }
        ]
    },
    "k8s_oom_cascade": {
        "id": "k8s_oom_cascade",
        "title": "Kubernetes Ingress Cascading 502s & Pod OOMKilled",
        "severity": "P1 - High",
        "domain": "deployment",
        "description": "Microservices in prod-cluster experiencing memory leaks, cgroup evictions, and cascading failures.",
        "responders": [
            {"name": "Elena", "role": "Platform Engineering Lead", "avatar": "👩‍🚀", "uid": 2001},
            {"name": "Carlos", "role": "DevOps / Kubernetes SRE", "avatar": "👨‍🔧", "uid": 2002},
            {"name": "Marcus", "role": "Observability Engineer", "avatar": "👨‍💻", "uid": 2003},
            {"name": "Dave", "role": "Engineering Director", "avatar": "👨‍💼", "uid": 1004},
        ],
        "utterances": [
            {
                "speaker": "Elena",
                "role": "Platform Lead",
                "text": "Alert shows 18 ingress gateway pods in CrashLoopBackOff on cluster prod-us-east.",
                "label": "Fact (Pod CrashLoop)",
                "expected_type": "fact"
            },
            {
                "speaker": "Carlos",
                "role": "Kubernetes SRE",
                "text": "I think the recent JVM heap configuration change is triggering kernel OOM kills.",
                "label": "Hypothesis (JVM Heap OOM)",
                "expected_type": "hypothesis"
            },
            {
                "speaker": "Marcus",
                "role": "Observability Engineer",
                "text": "Metrics confirm pod memory usage exceeded the 8GB container limit.",
                "label": "Fact (Memory Exceeded)",
                "expected_type": "fact"
            },
            {
                "speaker": "Elena",
                "role": "Platform Lead",
                "text": "Carlos, please increase the pod memory limits to 16GB in the helm values.",
                "label": "Action Delegation (to Carlos)",
                "expected_type": "action"
            },
            {
                "speaker": "Carlos",
                "role": "Kubernetes SRE",
                "text": "I will patch the deployment memory limit and trigger a rolling restart.",
                "label": "Action Committed (Carlos)",
                "expected_type": "action"
            },
            {
                "speaker": "Dave",
                "role": "Engineering Director",
                "text": "Signal, who owns the platform memory remediation?",
                "label": "Wake-Word Owner Query",
                "expected_type": "query"
            },
            {
                "speaker": "Elena",
                "role": "Platform Lead",
                "text": "Let's increase the HPA replica ceiling from 20 to 60 pods.",
                "label": "Decision (Scale HPA)",
                "expected_type": "decision"
            }
        ]
    },
    "db_deadlock_starvation": {
        "id": "db_deadlock_starvation",
        "title": "PostgreSQL Transaction Deadlocks & Connection Starvation",
        "severity": "P0 - Critical",
        "domain": "db",
        "description": "PostgreSQL master connection pool maxed at 500 connections with cascading lock waits.",
        "responders": [
            {"name": "Vikram", "role": "Lead Database Administrator", "avatar": "👨‍🔬", "uid": 1006},
            {"name": "Maya", "role": "Senior SRE", "avatar": "👩‍💻", "uid": 3001},
            {"name": "Alex", "role": "Backend Core Engineer", "avatar": "👨‍💻", "uid": 3002},
            {"name": "Alice", "role": "Incident Commander", "avatar": "👩‍💼", "uid": 1001},
        ],
        "utterances": [
            {
                "speaker": "Vikram",
                "role": "Lead DBA",
                "text": "We verified postgres active client connections reached the maximum limit of 500.",
                "label": "Fact (500 Max Connections)",
                "expected_type": "fact"
            },
            {
                "speaker": "Maya",
                "role": "Senior SRE",
                "text": "Logs indicate hundreds of transaction lock waits on the orders table.",
                "label": "Fact (Lock Waits)",
                "expected_type": "fact"
            },
            {
                "speaker": "Alex",
                "role": "Backend Engineer",
                "text": "Maybe the batch reconciliation job opened an uncommitted table lock.",
                "label": "Hypothesis (Batch Lock)",
                "expected_type": "hypothesis"
            },
            {
                "speaker": "Vikram",
                "role": "Lead DBA",
                "text": "Maya, please terminate the blocking PID 48291 holding the row lock.",
                "label": "Action Delegation (to Maya)",
                "expected_type": "action"
            },
            {
                "speaker": "Maya",
                "role": "Senior SRE",
                "text": "I will terminate the idle-in-transaction connection immediately.",
                "label": "Action Committed (Maya)",
                "expected_type": "action"
            },
            {
                "speaker": "Alice",
                "role": "Incident Commander",
                "text": "Signal, what is our status?",
                "label": "Wake-Word Status Query",
                "expected_type": "query"
            },
            {
                "speaker": "Vikram",
                "role": "Lead DBA",
                "text": "We decided to pause all background batch reconciliation jobs until peak traffic ends.",
                "label": "Decision (Pause Jobs)",
                "expected_type": "decision"
            }
        ]
    }
}


class ChaosService:
    def get_scenario(self, scenario_id: str) -> Optional[Dict[str, Any]]:
        scenario = PREBUILT_SCENARIOS.get(scenario_id)
        if not scenario:
            return None
        res = dict(scenario)
        res["name"] = res.get("title", scenario_id)
        steps = []
        for u in res.get("utterances", []):
            step = dict(u)
            step["is_wake_word"] = "signal" in step.get("text", "").lower()
            steps.append(step)
        res["steps"] = steps
        res["steps_count"] = len(steps)
        return res

    def list_scenarios(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": s["id"],
                "name": s["title"],
                "title": s["title"],
                "severity": s["severity"],
                "domain": s["domain"],
                "description": s["description"],
                "responder_count": len(s["responders"]),
                "utterance_count": len(s["utterances"]),
                "steps_count": len(s["utterances"]),
                "responders": s["responders"],
            }
            for s in PREBUILT_SCENARIOS.values()
        ]

    def generate_ai_scenario(self, incident_title: str, prompt_hint: Optional[str] = None) -> Dict[str, Any]:
        """
        Uses NVIDIA Nemotron to generate a dynamic, brutal, realistic SRE war room scenario.
        Falls back to pre-built scenario if LLM is unavailable.
        """
        if not settings.llm_enabled:
            return self.get_scenario("payment_outage")

        system_prompt = """You are an SRE Chaos Incident Designer. Generate a brutal, realistic production incident simulation.
The incident must involve 4-6 diverse engineering personas (e.g. SRE, DBA, Network, DevOps, SecOps, Tech Lead).
It must include:
1. Initial observed symptoms (facts)
2. Competing or conflicting theories (hypotheses)
3. A contradictory telemetry finding (where one engineer's claim is contradicted by telemetry)
4. An action item delegated to someone
5. An action item committed by that person
6. A wake-word query starting with "Signal, ..."
7. A mitigation decision

Return ONLY valid raw JSON with this exact schema:
{
  "id": "ai_generated_chaos",
  "title": "Short descriptive incident title",
  "severity": "P0 - Critical",
  "domain": "db|api|payments|deployment|monitoring|cache",
  "description": "1-sentence summary",
  "responders": [
    {"name": "Name", "role": "Role", "avatar": "👨‍💻", "uid": 1001}
  ],
  "utterances": [
    {
      "speaker": "Name",
      "role": "Role",
      "text": "Realistic spoken sentence",
      "label": "Short label",
      "expected_type": "fact|hypothesis|action|decision|query",
      "is_contradiction": false
    }
  ]
}"""

        user_content = f"Incident context: {incident_title}."
        if prompt_hint:
            user_content += f" Custom domain/flavor: {prompt_hint}."

        try:
            is_nvidia = "nvidia.com" in settings.llm_base_url or "nemotron" in settings.llm_model.lower()
            payload: dict = {
                "model": settings.llm_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                "temperature": 0.3,
                "max_tokens": 1500
            }
            if is_nvidia:
                payload["chat_template_kwargs"] = {"enable_thinking": False}

            response = httpx.post(
                f"{settings.llm_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.llm_api_key}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=18.0
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()

            m = re.search(r'(\{.*\})', content, re.DOTALL)
            if m:
                parsed = json.loads(m.group(1))
                if "title" in parsed and "utterances" in parsed and len(parsed["utterances"]) >= 4:
                    parsed["id"] = f"ai_gen_{uuid.uuid4().hex[:6]}"
                    parsed["name"] = parsed["title"]
                    steps = []
                    for u in parsed["utterances"]:
                        step = dict(u)
                        step["is_wake_word"] = "signal" in step.get("text", "").lower()
                        steps.append(step)
                    parsed["steps"] = steps
                    parsed["steps_count"] = len(steps)
                    return parsed
        except Exception as e:
            print(f"AI Chaos generation fallback: {e}")

        # Fallback to payment outage
        fallback = self.get_scenario("payment_outage")
        if fallback:
            fallback = dict(fallback)
            fallback["title"] = f"Stress Test: {incident_title}"
            fallback["name"] = fallback["title"]
            return fallback
        return PREBUILT_SCENARIOS["payment_outage"]


chaos_service = ChaosService()
