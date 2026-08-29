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


document_service = DocumentService()
