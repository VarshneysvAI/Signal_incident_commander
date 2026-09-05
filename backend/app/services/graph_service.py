from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
from ..models import (
    GraphNode, GraphEdge, ActionItem, Utterance, EventLog,
    NodeType, NodeStatus, EdgeType, Confidence, ActionStatus
)
from datetime import datetime


class GraphService:
    """
    Knowledge graph construction service.
    Creates nodes and edges based on parsed utterances.
    """
    
    def process_utterance(self, db: Session, incident_id: str, utterance: Utterance, parsed: Dict[str, Any]):
        """Process a parsed utterance and create appropriate graph nodes/edges."""
        utt_type = parsed.get("utterance_type", "uncertain")
        topic = parsed.get("topic", "general")
        negated = parsed.get("negated", False)
        confidence = parsed.get("confidence", "medium")
        label = parsed.get("normalized_label", utterance.text)
        speaker = utterance.speaker_name
        
        # Get incident node
        incident_node = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.incident
        ).first()
        
        if utt_type == "fact":
            self._create_fact_node(db, incident_id, incident_node, utterance, label, speaker, topic, confidence, negated, parsed)
        elif utt_type == "hypothesis":
            self._create_hypothesis_node(db, incident_id, incident_node, utterance, label, speaker, topic, confidence, negated, parsed)
        elif utt_type == "decision":
            self._create_decision_node(db, incident_id, incident_node, utterance, label, speaker, topic, confidence, negated)
        elif utt_type == "action":
            self._create_action_node(db, incident_id, incident_node, utterance, label, speaker, topic, confidence, parsed)
        elif utt_type == "question":
            self._create_question_node(db, incident_id, incident_node, utterance, label, speaker, topic)
        elif utt_type == "off_topic":
            self._create_off_topic_node(db, incident_id, utterance, label, speaker)
        else:  # uncertain
            self._create_uncertain_node(db, incident_id, utterance, label, speaker)
    
    def _get_node_status(self, confidence: str, negated: bool) -> NodeStatus:
        """Determine node status from confidence and negation."""
        if negated:
            return NodeStatus.rejected
        if confidence == "high":
            return NodeStatus.confirmed
        elif confidence == "medium":
            return NodeStatus.unverified
        return NodeStatus.active
    
    def _create_fact_node(self, db, incident_id, incident_node, utterance, label, speaker, topic, confidence, negated, parsed):
        polarity = parsed.get("polarity")
        status = self._get_node_status(confidence, negated)
        
        metadata = {"polarity": polarity} if polarity else {}
        
        node = GraphNode(
            incident_id=incident_id,
            type=NodeType.fact,
            label=label,
            speaker=speaker,
            status=status,
            topic=topic,
            confidence=Confidence[confidence] if confidence in Confidence.__members__ else Confidence.medium,
            source_utterance_id=utterance.id,
            metadata_json=metadata
        )
        db.add(node)
        db.flush()
        
        # Edge from incident
        if incident_node:
            edge = GraphEdge(
                incident_id=incident_id,
                from_node_id=incident_node.id,
                to_node_id=node.id,
                type=EdgeType.investigated,
                source_utterance_id=utterance.id
            )
            db.add(edge)
        
        # Log event
        db.add(EventLog(
            incident_id=incident_id,
            event_type="node_created",
            payload_json={"node_type": "fact", "label": label, "status": status.value}
        ))
        
        # Check for contradictions
        from ..services.contradiction_service import contradiction_service
        contradiction_service.check_fact_contradictions(db, node)
        
        # Flush and commit to ensure status changes persist
        db.flush()
        db.commit()
    
    def _create_hypothesis_node(self, db, incident_id, incident_node, utterance, label, speaker, topic, confidence, negated, parsed):
        polarity = parsed.get("polarity")
        status = NodeStatus.rejected if negated else NodeStatus.active
        
        metadata = {"polarity": polarity} if polarity else {}
        
        node = GraphNode(
            incident_id=incident_id,
            type=NodeType.hypothesis,
            label=label,
            speaker=speaker,
            status=status,
            topic=topic,
            confidence=Confidence[confidence] if confidence in Confidence.__members__ else Confidence.medium,
            source_utterance_id=utterance.id,
            metadata_json=metadata
        )
        db.add(node)
        db.flush()
        
        # Edge from incident
        if incident_node:
            edge = GraphEdge(
                incident_id=incident_id,
                from_node_id=incident_node.id,
                to_node_id=node.id,
                type=EdgeType.investigated,
                source_utterance_id=utterance.id
            )
            db.add(edge)
        
        # Log event
        db.add(EventLog(
            incident_id=incident_id,
            event_type="node_created",
            payload_json={"node_type": "hypothesis", "label": label}
        ))
        
        # Check for contradictions with facts
        from ..services.contradiction_service import contradiction_service
        contradiction_service.check_hypothesis_contradictions(db, node)
        
        # Flush again to ensure status changes are persisted
        db.flush()
        db.commit()
    
    def _create_decision_node(self, db, incident_id, incident_node, utterance, label, speaker, topic, confidence, negated):
        status = NodeStatus.rejected if negated else NodeStatus.active
        
        node = GraphNode(
            incident_id=incident_id,
            type=NodeType.decision,
            label=label,
            speaker=speaker,
            status=status,
            topic=topic,
            confidence=Confidence[confidence] if confidence in Confidence.__members__ else Confidence.medium,
            source_utterance_id=utterance.id
        )
        db.add(node)
        db.flush()
        
        # Find active hypothesis with same topic and link
        hypothesis = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type == NodeType.hypothesis,
            GraphNode.topic == topic,
            GraphNode.status == NodeStatus.active
        ).first()
        
        if hypothesis:
            edge = GraphEdge(
                incident_id=incident_id,
                from_node_id=hypothesis.id,
                to_node_id=node.id,
                type=EdgeType.led_to,
                source_utterance_id=utterance.id
            )
            db.add(edge)
        elif incident_node:
            edge = GraphEdge(
                incident_id=incident_id,
                from_node_id=incident_node.id,
                to_node_id=node.id,
                type=EdgeType.led_to,
                source_utterance_id=utterance.id
            )
            db.add(edge)
        
        # Log event
        db.add(EventLog(
            incident_id=incident_id,
            event_type="node_created",
            payload_json={"node_type": "decision", "label": label}
        ))
    
    def _create_action_node(self, db, incident_id, incident_node, utterance, label, speaker, topic, confidence, parsed):
        proposed_owner = parsed.get("proposed_owner")
        action_status_str = parsed.get("action_status", "unassigned")
        
        # Create graph node (orange action node)
        node = GraphNode(
            incident_id=incident_id,
            type=NodeType.action,
            label=label,
            speaker=speaker,
            status=NodeStatus.active,
            topic=topic,
            confidence=Confidence[confidence] if confidence in Confidence.__members__ else Confidence.medium,
            source_utterance_id=utterance.id,
            metadata_json={"owner": proposed_owner}
        )
        db.add(node)
        db.flush()
        
        # Create ActionItem
        action_item = ActionItem(
            incident_id=incident_id,
            label=label,
            proposed_owner=proposed_owner,
            confirmed_owner=proposed_owner if action_status_str == "committed" else None,
            status=ActionStatus[action_status_str],
            source_utterance_id=utterance.id
        )
        db.add(action_item)
        
        # Find nearest decision or hypothesis with same topic, or link to incident
        parent = db.query(GraphNode).filter(
            GraphNode.incident_id == incident_id,
            GraphNode.type.in_([NodeType.decision, NodeType.hypothesis]),
            GraphNode.topic == topic,
            GraphNode.status == NodeStatus.active
        ).first()
        
        if parent:
            edge = GraphEdge(
                incident_id=incident_id,
                from_node_id=parent.id,
                to_node_id=node.id,
                type=EdgeType.assigned,
                source_utterance_id=utterance.id
            )
            db.add(edge)
        elif incident_node:
            edge = GraphEdge(
                incident_id=incident_id,
                from_node_id=incident_node.id,
                to_node_id=node.id,
                type=EdgeType.assigned,
                source_utterance_id=utterance.id
            )
            db.add(edge)
        
        # Log events
        db.add(EventLog(
            incident_id=incident_id,
            event_type="node_created",
            payload_json={"node_type": "action", "label": label}
        ))
        db.add(EventLog(
            incident_id=incident_id,
            event_type="action_created",
            payload_json={"label": label, "owner": proposed_owner, "status": action_status_str}
        ))
        
        # Flush and commit to ensure ActionItem is persisted
        db.flush()
        db.commit()
    
    def _create_question_node(self, db, incident_id, incident_node, utterance, label, speaker, topic):
        node = GraphNode(
            incident_id=incident_id,
            type=NodeType.question,
            label=label,
            speaker=speaker,
            status=NodeStatus.active,
            topic=topic,
            confidence=Confidence.medium,
            source_utterance_id=utterance.id
        )
        db.add(node)
        db.flush()
        
        if incident_node:
            edge = GraphEdge(
                incident_id=incident_id,
                from_node_id=incident_node.id,
                to_node_id=node.id,
                type=EdgeType.investigated,
                source_utterance_id=utterance.id
            )
            db.add(edge)
        
        db.add(EventLog(
            incident_id=incident_id,
            event_type="node_created",
            payload_json={"node_type": "question", "label": label}
        ))
    
    def _create_off_topic_node(self, db, incident_id, utterance, label, speaker):
        node = GraphNode(
            incident_id=incident_id,
            type=NodeType.off_topic,
            label=label,
            speaker=speaker,
            status=NodeStatus.faded,
            topic="general",
            confidence=Confidence.low,
            source_utterance_id=utterance.id
        )
        db.add(node)
        
        db.add(EventLog(
            incident_id=incident_id,
            event_type="node_created",
            payload_json={"node_type": "off_topic", "label": label}
        ))
    
    def _create_uncertain_node(self, db, incident_id, utterance, label, speaker):
        node = GraphNode(
            incident_id=incident_id,
            type=NodeType.uncertain,
            label=label,
            speaker=speaker,
            status=NodeStatus.needs_review,
            topic="general",
            confidence=Confidence.uncertain,
            source_utterance_id=utterance.id
        )
        db.add(node)
        
        db.add(EventLog(
            incident_id=incident_id,
            event_type="node_created",
            payload_json={"node_type": "uncertain", "label": label}
        ))


graph_service = GraphService()
