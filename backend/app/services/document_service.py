from sqlalchemy.orm import Session
from typing import Dict, Any, List
from ..models import (
    GraphNode, GraphEdge, Utterance, ActionItem, Incident, QueryRecord,
    NodeType, NodeStatus, EdgeType
)
from datetime import datetime


class DocumentService:
    """
    Document generation service.
    Generates structured incident document from database state.
    """
    
    def get_document_data(self, db: Session, incident_id: str) -> Dict[str, Any]:
        """Get document data as structured dict."""
        incident = db.query(Incident).filter(Incident.id == incident_id).first()
        if not incident:
            return {}
        
        # Get all nodes by type
        facts = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.fact
        ).all()
        
        hypotheses = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.hypothesis
        ).all()
        
        decisions = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.decision
        ).all()
        
        questions = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.question
        ).all()
        
        actions = db.query(ActionItem).filter(
            ActionItem.incident_id == incident_id
        ).all()
        
        contradictions = db.query(GraphEdge).filter(
            GraphEdge.incident_id == incident_id,
            GraphEdge.type == EdgeType.contradicts
        ).all()
        
        utterances = db.query(Utterance).filter(
            Utterance.incident_id == incident_id
        ).order_by(Utterance.timestamp.asc()).all()
        
        queries = db.query(QueryRecord).filter(
            QueryRecord.incident_id == incident_id
        ).order_by(QueryRecord.created_at.asc()).all()
        
        return {
            "incident": {
                "id": incident.id,
                "title": incident.title,
                "status": incident.status.value,
                "started_at": incident.started_at.isoformat() if incident.started_at else None,
                "closed_at": incident.closed_at.isoformat() if incident.closed_at else None,
            },
            "facts": [self._node_to_dict(f) for f in facts],
            "hypotheses_active": [self._node_to_dict(h) for h in hypotheses if h.status == NodeStatus.active],
            "hypotheses_ruled_out": [self._node_to_dict(h) for h in hypotheses if h.status in [NodeStatus.faded, NodeStatus.rejected]],
            "decisions": [self._node_to_dict(d) for d in decisions],
            "questions": [self._node_to_dict(q) for q in questions],
            "actions": [self._action_to_dict(a) for a in actions],
            "contradictions": [self._edge_to_dict(c, db) for c in contradictions],
            "timeline": [self._utterance_to_dict(u) for u in utterances],
            "queries": [{"text": q.text, "answer": q.answer} for q in queries],
        }
    
    def _node_to_dict(self, node: GraphNode) -> Dict[str, Any]:
        return {
            "id": node.id,
            "label": node.label,
            "speaker": node.speaker,
            "status": node.status.value,
            "topic": node.topic,
            "created_at": node.created_at.isoformat() if node.created_at else None,
        }
    
    def _action_to_dict(self, action: ActionItem) -> Dict[str, Any]:
        return {
            "id": action.id,
            "label": action.label,
            "proposed_owner": action.proposed_owner,
            "confirmed_owner": action.confirmed_owner,
            "status": action.status.value,
            "created_at": action.created_at.isoformat() if action.created_at else None,
        }
    
    def _edge_to_dict(self, edge: GraphEdge, db: Session) -> Dict[str, Any]:
        from_node = db.query(GraphNode).filter(GraphNode.id == edge.from_node_id).first()
        to_node = db.query(GraphNode).filter(GraphNode.id == edge.to_node_id).first()
        
        return {
            "from": from_node.label if from_node else "Unknown",
            "to": to_node.label if to_node else "Unknown",
            "type": edge.type.value,
        }
    
    def _utterance_to_dict(self, utterance: Utterance) -> Dict[str, Any]:
        return {
            "id": utterance.id,
            "speaker": utterance.speaker_name,
            "text": utterance.text,
            "parsed_type": utterance.parser_type,
            "timestamp": utterance.timestamp.isoformat() if utterance.timestamp else None,
        }


    def get_formatted_document(self, db: Session, incident_id: str) -> Dict[str, Any]:
        """Get formatted document matching frontend IncidentDocument interface."""
        incident = db.query(Incident).filter(Incident.id == incident_id).first()
        if not incident:
            return {}
        
        raw_data = self.get_document_data(db, incident_id)
        
        # Calculate duration
        start_time = incident.started_at or datetime.utcnow()
        end_time = incident.closed_at or datetime.utcnow()
        if start_time.tzinfo:
            now_dt = datetime.now(start_time.tzinfo)
            duration = max(0, int((end_time - start_time).total_seconds() // 60))
        else:
            duration = max(0, int((end_time - start_time).total_seconds() // 60))
        
        summary = {
            "title": incident.title,
            "id": incident.id,
            "started_at": start_time.isoformat(),
            "duration_minutes": duration,
            "status": incident.status.value,
        }
        
        # Build sections
        sections = [
            {
                "title": "Confirmed Facts",
                "items": [
                    {
                        "content": f["label"],
                        "speaker": f.get("speaker"),
                        "timestamp": f.get("created_at"),
                        "type": "fact",
                        "status": f.get("status")
                    }
                    for f in raw_data.get("facts", [])
                ]
            },
            {
                "title": "Working Hypotheses",
                "items": [
                    {
                        "content": h["label"],
                        "speaker": h.get("speaker"),
                        "timestamp": h.get("created_at"),
                        "type": "hypothesis",
                        "status": h.get("status")
                    }
                    for h in raw_data.get("hypotheses_active", [])
                ]
            },
            {
                "title": "Ruled-Out Hypotheses",
                "items": [
                    {
                        "content": h["label"],
                        "speaker": h.get("speaker"),
                        "timestamp": h.get("created_at"),
                        "type": "hypothesis",
                        "status": h.get("status")
                    }
                    for h in raw_data.get("hypotheses_ruled_out", [])
                ]
            },
            {
                "title": "Decisions",
                "items": [
                    {
                        "content": d["label"],
                        "speaker": d.get("speaker"),
                        "timestamp": d.get("created_at"),
                        "type": "decision",
                        "status": d.get("status")
                    }
                    for d in raw_data.get("decisions", [])
                ]
            },
            {
                "title": "Action Items",
                "items": [
                    {
                        "content": f"{a['label']} — {a.get('confirmed_owner') or a.get('proposed_owner') or 'Unassigned'} ({a['status']})",
                        "speaker": a.get("confirmed_owner") or a.get("proposed_owner"),
                        "timestamp": a.get("created_at"),
                        "type": "action",
                        "status": a.get("status")
                    }
                    for a in raw_data.get("actions", [])
                ]
            },
            {
                "title": "Unresolved Questions",
                "items": [
                    {
                        "content": q["label"],
                        "speaker": q.get("speaker"),
                        "timestamp": q.get("created_at"),
                        "type": "question",
                        "status": q.get("status")
                    }
                    for q in raw_data.get("questions", [])
                ]
            },
        ]
        
        # Calculate Gap Radar
        gaps = []
        
        # Critical gap: check if any commander or leader declared
        has_commander = any(
            "commander" in (f.get("label", "").lower()) or "incident commander" in (f.get("label", "").lower())
            for f in raw_data.get("facts", [])
        )
        if not has_commander:
            gaps.append({
                "severity": "critical",
                "description": "No Incident Commander declared yet.",
                "count": 1
            })
        
        # High gap: unassigned actions
        unassigned_actions = [a for a in raw_data.get("actions", []) if a["status"] == "unassigned"]
        if unassigned_actions:
            gaps.append({
                "severity": "high",
                "description": f"{len(unassigned_actions)} unassigned action item(s) need ownership assigned.",
                "count": len(unassigned_actions)
            })
        
        # High gap: pending confirmation
        pending_actions = [a for a in raw_data.get("actions", []) if a["status"] == "pending_owner_confirmation"]
        if pending_actions:
            gaps.append({
                "severity": "high",
                "description": f"{len(pending_actions)} action item(s) pending owner confirmation.",
                "count": len(pending_actions)
            })
        
        # Medium gap: active contradictions
        contradictions = raw_data.get("contradictions", [])
        if contradictions:
            gaps.append({
                "severity": "medium",
                "description": f"{len(contradictions)} active contradiction(s) detected across findings.",
                "count": len(contradictions)
            })
        
        # Medium gap: active hypotheses without decisions
        hypotheses_count = len(raw_data.get("hypotheses_active", []))
        decisions_count = len(raw_data.get("decisions", []))
        if hypotheses_count >= 3 and decisions_count == 0:
            gaps.append({
                "severity": "medium",
                "description": f"{hypotheses_count} active hypotheses without any agreed decision.",
                "count": hypotheses_count
            })
        
        # Low gap: unresolved questions
        questions = raw_data.get("questions", [])
        if questions:
            gaps.append({
                "severity": "low",
                "description": f"{len(questions)} unresolved question(s) pending answers.",
                "count": len(questions)
            })
        
        return {
            "summary": summary,
            "sections": sections,
            "gaps": gaps,
        }
    
    def get_timeline(self, db: Session, incident_id: str) -> List[Dict[str, Any]]:
        """Get timeline utterances for an incident."""
        utterances = db.query(Utterance).filter(
            Utterance.incident_id == incident_id
        ).order_by(Utterance.timestamp.asc()).all()
        
        return [
            {
                "id": u.id,
                "incident_id": u.incident_id,
                "event_id": u.event_id,
                "speaker_name": u.speaker_name,
                "text": u.text,
                "normalized_text": u.normalized_text,
                "timestamp": u.timestamp.isoformat() if u.timestamp else None,
                "parser_type": u.parser_type,
                "parser_method": u.parser_method.value if u.parser_method else "deterministic",
                "confidence": u.confidence.value if u.confidence else "medium",
                "negated": u.negated,
                "topic": u.topic,
                "raw_parser_json": u.raw_parser_json or {},
            }
            for u in utterances
        ]


document_service = DocumentService()
