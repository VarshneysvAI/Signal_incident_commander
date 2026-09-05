from sqlalchemy.orm import Session
from typing import List, Optional
from ..models import GraphNode, GraphEdge, NodeType, NodeStatus, EdgeType, EventLog


class ContradictionService:
    """
    Contradiction detection service.
    Detects conflicts between facts and hypotheses based on topic and polarity.
    """
    
    def check_fact_contradictions(self, db: Session, fact_node: GraphNode):
        """Check if a new fact contradicts any active hypotheses."""
        if not fact_node.topic or fact_node.topic == "general":
            return
        
        fact_polarity = fact_node.metadata_json.get("polarity")
        if not fact_polarity:
            return
        
        # Find active hypotheses with same topic
        hypotheses = db.query(GraphNode).filter(
            GraphNode.incident_id == fact_node.incident_id,
            GraphNode.type == NodeType.hypothesis,
            GraphNode.topic == fact_node.topic,
            GraphNode.status.in_([NodeStatus.active, NodeStatus.unverified])
        ).all()
        
        for hypothesis in hypotheses:
            hyp_polarity = hypothesis.metadata_json.get("polarity")
            
            # Check for opposite polarity
            if self._are_polarities_opposite(fact_polarity, hyp_polarity):
                # Create contradicts edge
                edge = GraphEdge(
                    incident_id=fact_node.incident_id,
                    from_node_id=fact_node.id,
                    to_node_id=hypothesis.id,
                    type=EdgeType.contradicts,
                    source_utterance_id=fact_node.source_utterance_id
                )
                db.add(edge)
                
                # Mark hypothesis as faded/challenged
                hypothesis.status = NodeStatus.faded
                
                # Log contradiction event
                db.add(EventLog(
                    incident_id=fact_node.incident_id,
                    event_type="contradiction_detected",
                    payload_json={
                        "fact_id": fact_node.id,
                        "hypothesis_id": hypothesis.id,
                        "topic": fact_node.topic
                    }
                ))
    
    def check_hypothesis_contradictions(self, db: Session, hypothesis_node: GraphNode):
        """Check if a new hypothesis contradicts any confirmed facts."""
        if not hypothesis_node.topic or hypothesis_node.topic == "general":
            return
        
        hyp_polarity = hypothesis_node.metadata_json.get("polarity")
        if not hyp_polarity:
            return
        
        # Find confirmed facts with same topic
        facts = db.query(GraphNode).filter(
            GraphNode.incident_id == hypothesis_node.incident_id,
            GraphNode.type == NodeType.fact,
            GraphNode.topic == hypothesis_node.topic,
            GraphNode.status.in_([NodeStatus.confirmed, NodeStatus.unverified])
        ).all()
        
        for fact in facts:
            fact_polarity = fact.metadata_json.get("polarity")
            
            # Check for opposite polarity
            if self._are_polarities_opposite(hyp_polarity, fact_polarity):
                # Create contradicts edge
                edge = GraphEdge(
                    incident_id=hypothesis_node.incident_id,
                    from_node_id=fact.id,
                    to_node_id=hypothesis_node.id,
                    type=EdgeType.contradicts,
                    source_utterance_id=hypothesis_node.source_utterance_id
                )
                db.add(edge)
                
                # Mark hypothesis as faded/challenged
                hypothesis_node.status = NodeStatus.faded
                
                # Log contradiction event
                db.add(EventLog(
                    incident_id=hypothesis_node.incident_id,
                    event_type="contradiction_detected",
                    payload_json={
                        "fact_id": fact.id,
                        "hypothesis_id": hypothesis_node.id,
                        "topic": hypothesis_node.topic
                    }
                ))
    
    def _are_polarities_opposite(self, p1: str, p2: Optional[str]) -> bool:
        """Check if two polarities are opposite."""
        if not p2:
            return False
        return (p1 == "positive" and p2 == "negative") or (p1 == "negative" and p2 == "positive")
    
    def check_action_conflicts(self, db: Session, incident_id: str, label: str, owner: str):
        """Check for ownership conflicts in actions."""
        from ..models import ActionItem, ActionStatus
        
        # Simple keyword overlap check
        label_keywords = set(label.lower().split())
        
        existing_actions = db.query(ActionItem).filter(
            ActionItem.incident_id == incident_id,
            ActionItem.status.in_([ActionStatus.unassigned, ActionStatus.pending_owner_confirmation, ActionStatus.committed])
        ).all()
        
        conflicts = []
        for action in existing_actions:
            action_keywords = set(action.label.lower().split())
            # Check for significant keyword overlap
            overlap = label_keywords & action_keywords
            if len(overlap) >= 2 and action.proposed_owner != owner:
                conflicts.append(action)
        
        return conflicts


contradiction_service = ContradictionService()
