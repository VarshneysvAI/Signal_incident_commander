from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional, Tuple
from ..models import (
    GraphNode, GraphEdge, Utterance, ActionItem, QueryRecord, EventLog, Incident,
    NodeType, NodeStatus, EdgeType
)
from ..config import settings


class QueryService:
    """
    Query answering engine.
    Answers are built from database state using templates.
    LLM is only used for open queries with grounded context.
    """
    
    def answer_query(self, db: Session, incident_id: str, text: str, speaker: Optional[str] = None) -> Dict[str, Any]:
        """Answer a query about the incident."""
        intent = self._detect_intent(text)
        
        incident = db.query(Incident).filter(Incident.id == incident_id).first()
        if not incident:
            return {"intent": "error", "answer": "Incident not found", "answer_method": "template"}
        
        if intent == "status":
            answer, nodes = self._answer_status(db, incident_id, incident.title)
        elif intent == "owner":
            answer, nodes = self._answer_owner(db, incident_id, text)
        elif intent == "contradictions":
            answer, nodes = self._answer_contradictions(db, incident_id)
        elif intent == "actions":
            answer, nodes = self._answer_actions(db, incident_id)
        elif intent == "decisions":
            answer, nodes = self._answer_decisions(db, incident_id)
        elif intent == "questions":
            answer, nodes = self._answer_questions(db, incident_id)
        elif intent == "summary":
            answer, nodes = self._answer_summary(db, incident_id, incident.title)
        else:
            answer, nodes = self._answer_open(db, incident_id, text)
        
        query_record = QueryRecord(
            incident_id=incident_id,
            speaker=speaker,
            text=text,
            intent=intent,
            answer=answer,
            answer_method="llm" if len(nodes) > 0 and intent == "open" else "template",
            grounded_node_ids_json=nodes
        )
        db.add(query_record)
        
        db.add(EventLog(
            incident_id=incident_id,
            event_type="query_answered",
            payload_json={"intent": intent, "speaker": speaker}
        ))
        
        return {
            "intent": intent,
            "answer": answer,
            "answer_method": query_record.answer_method,
            "grounded_node_ids": nodes
        }
    
    def _detect_intent(self, text: str) -> str:
        text_lower = text.lower()
        
        if "status" in text_lower or "what is our" in text_lower:
            return "status"
        if "who owns" in text_lower or "owner" in text_lower:
            return "owner"
        if "contradiction" in text_lower or "conflict" in text_lower:
            return "contradictions"
        if "action" in text_lower or "pending" in text_lower:
            return "actions"
        if "decid" in text_lower:
            return "decisions"
        if "question" in text_lower or "unresolved" in text_lower:
            return "questions"
        if "summar" in text_lower or "brief" in text_lower:
            return "summary"
        
        return "open"
    
    def _answer_status(self, db: Session, incident_id: str, title: str) -> Tuple[str, List[int]]:
        facts = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.fact,
            GraphNode.status.in_([NodeStatus.confirmed, NodeStatus.unverified])
        ).all()
        
        active_hyp = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.hypothesis,
            GraphNode.status == NodeStatus.active
        ).all()
        
        faded_hyp = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.hypothesis,
            GraphNode.status == NodeStatus.faded
        ).all()
        
        decisions = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.decision,
            GraphNode.status == NodeStatus.active
        ).all()
        
        actions = db.query(ActionItem).filter(
            ActionItem.incident_id == incident_id,
            ActionItem.status.in_(["committed", "in_progress", "pending_owner_confirmation"])
        ).all()
        
        questions = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.question,
            GraphNode.status == NodeStatus.active
        ).all()
        
        node_ids = [n.id for n in facts + active_hyp + decisions]
        
        parts = [f"{title} is active."]
        
        if facts:
            parts.append(f"Confirmed: {'; '.join(f.label for f in facts[:3])}")
        if faded_hyp:
            parts.append(f"Ruled out: {'; '.join(h.label for h in faded_hyp[:3])}")
        if active_hyp:
            parts.append(f"Working hypothesis: {'; '.join(h.label for h in active_hyp[:3])}")
        if decisions:
            parts.append(f"Decisions: {'; '.join(d.label for d in decisions[:3])}")
        if actions:
            action_strs = []
            for a in actions[:3]:
                owner = a.confirmed_owner or a.proposed_owner or "unassigned"
                action_strs.append(f"{a.label} ({owner})")
            parts.append(f"Actions: {', '.join(action_strs)}")
        if questions:
            parts.append(f"Unresolved: {'; '.join(q.label for q in questions[:3])}")
        
        return " ".join(parts), node_ids
    
    def _answer_owner(self, db: Session, incident_id: str, text: str) -> Tuple[str, List[int]]:
        keywords = set(text.lower().replace("who owns", "").replace("owner", "").split())
        
        actions = db.query(ActionItem).filter(
            ActionItem.incident_id == incident_id,
            ActionItem.status.in_(["committed", "pending_owner_confirmation", "unassigned"])
        ).all()
        
        for action in actions:
            action_words = set(action.label.lower().split())
            if keywords & action_words:
                owner = action.confirmed_owner or action.proposed_owner or "unassigned"
                return f"{owner} is assigned to '{action.label}'. Status: {action.status.value}.", [action.id]
        
        return "No action matching that term is tracked.", []
    
    def _answer_contradictions(self, db: Session, incident_id: str) -> Tuple[str, List[int]]:
        contradicts_edges = db.query(GraphEdge).filter(
            GraphEdge.incident_id == incident_id,
            GraphEdge.type == EdgeType.contradicts
        ).all()
        
        if not contradicts_edges:
            return "No active contradictions.", []
        
        node_ids = []
        parts = []
        for edge in contradicts_edges[:5]:
            from_node = db.query(GraphNode).filter(GraphNode.id == edge.from_node_id).first()
            to_node = db.query(GraphNode).filter(GraphNode.id == edge.to_node_id).first()
            if from_node and to_node:
                parts.append(f"{from_node.label} conflicts with {to_node.label}")
                node_ids.extend([from_node.id, to_node.id])
        
        return "Contradictions detected: " + "; ".join(parts), node_ids
    
    def _answer_actions(self, db: Session, incident_id: str) -> Tuple[str, List[int]]:
        actions = db.query(ActionItem).filter(
            ActionItem.incident_id == incident_id
        ).order_by(ActionItem.created_at.asc()).all()
        
        if not actions:
            return "No action items tracked.", []
        
        node_ids = [a.source_utterance_id for a in actions if a.source_utterance_id]
        parts = []
        for a in actions:
            owner = a.confirmed_owner or a.proposed_owner or "unassigned"
            parts.append(f"{a.label} - {owner} ({a.status.value})")
        
        return "Action items: " + "; ".join(parts), node_ids
    
    def _answer_decisions(self, db: Session, incident_id: str) -> Tuple[str, List[int]]:
        decisions = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.decision
        ).all()
        
        if not decisions:
            return "No decisions recorded.", []
        
        node_ids = [d.id for d in decisions]
        labels = [d.label for d in decisions]
        
        return "Decisions: " + "; ".join(labels), node_ids
    
    def _answer_questions(self, db: Session, incident_id: str) -> Tuple[str, List[int]]:
        questions = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.question,
            GraphNode.status == NodeStatus.active
        ).all()
        
        if not questions:
            return "No unresolved questions.", []
        
        node_ids = [q.id for q in questions]
        labels = [q.label for q in questions]
        
        return "Unresolved questions: " + "; ".join(labels), node_ids
    
    def _answer_summary(self, db: Session, incident_id: str, title: str) -> Tuple[str, List[int]]:
        return self._answer_status(db, incident_id, title)
    
    def _answer_open(self, db: Session, incident_id: str, text: str) -> Tuple[str, List[int]]:
        from ..config import settings
        
        if settings.llm_enabled:
            try:
                answer, nodes = self._llm_grounded_answer(db, incident_id, text)
                if answer:
                    return answer, nodes
            except Exception:
                pass
        
        return self._answer_summary(db, incident_id, "Incident")
    
    def _llm_grounded_answer(self, db: Session, incident_id: str, text: str) -> Tuple[Optional[str], List[int]]:
        import httpx
        import json
        
        doc_data = self._get_document_context(db, incident_id)
        
        system_prompt = """You are answering questions about an incident using ONLY the provided context.
If the answer cannot be found in the context, say "I don't have enough information to answer that."
Return JSON: {"answer": "...", "source_node_ids": [1,2,3]}"""
        
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
                        {"role": "user", "content": f"Context: {json.dumps(doc_data)}\n\nQuestion: {text}"}
                    ],
                    "temperature": 0,
                    "max_tokens": 300
                },
                timeout=8.0
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            result = json.loads(content.strip())
            answer = result.get("answer", "")
            node_ids = result.get("source_node_ids", [])
            
            if answer:
                return answer, node_ids
        except Exception:
            pass
        
        return None, []
    
    def _get_document_context(self, db: Session, incident_id: str) -> dict:
        from .document_service import document_service
        return document_service.get_document_data(db, incident_id)


query_service = QueryService()
