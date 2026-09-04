import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base, get_db
from app.models import Incident, Utterance, GraphNode, GraphEdge
from app.services.graph_service import graph_service
from app.services.parser_service import parser_service


@pytest.fixture
def test_db():
    """Create in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    def override_get_db():
        try:
            db = TestingSessionLocal()
            yield db
        finally:
            db.close()
    
    return override_get_db, engine


@pytest.fixture
def test_incident(test_db):
    """Create a test incident."""
    get_db_func, engine = test_db
    db = next(get_db_func())
    
    incident = Incident(
        id="test-incident-1",
        title="Test Outage",
        status="active",
        channel_name="#test-channel"
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    
    yield incident
    db.close()


class TestGraphService:
    """Test graph creation and contradiction detection."""
    
    def test_create_fact_node(self, test_db, test_incident):
        """Fact utterance creates confirmed fact node."""
        get_db_func, _ = test_db
        db = next(get_db_func())
        
        # Create utterance first
        utterance = Utterance(
            incident_id=test_incident.id,
            event_id="evt-1",
            speaker_name="Bob",
            text="Metrics show DB is healthy.",
            normalized_text="metrics show db is healthy.",
            parser_type="fact",
            parser_method="deterministic",
            confidence="high",
            topic="db"
        )
        db.add(utterance)
        db.commit()
        db.refresh(utterance)
        
        # Parse utterance
        parse_result = parser_service.parse("Metrics show DB is healthy.", "Bob")
        
        # Create graph nodes
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance,
            parsed=parse_result
        )
        
        # Verify node was created
        node = db.query(GraphNode).filter(GraphNode.source_utterance_id == utterance.id).first()
        assert node is not None
        assert node.type == "fact"
        assert node.status == "confirmed"
        assert node.topic == "db"
        
        db.close()
    
    def test_create_hypothesis_node(self, test_db, test_incident):
        """Hypothesis utterance creates active hypothesis node."""
        get_db_func, _ = test_db
        db = next(get_db_func())
        
        utterance = Utterance(
            
            incident_id=test_incident.id,
            event_id="evt-2",
            speaker_name="Alice",
            text="I think DB is the issue.",
            normalized_text="i think db is the issue.",
            parser_type="hypothesis",
            parser_method="deterministic",
            confidence="high",
            topic="db"
        )
        db.add(utterance)
        db.commit()
        
        parse_result = parser_service.parse("I think DB is the issue.", "Alice")
        
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance,
            parsed=parse_result
        )
        
        node = db.query(GraphNode).filter(GraphNode.source_utterance_id == utterance.id).first()
        assert node is not None
        assert node.type == "hypothesis"
        assert node.status == "active"
        
        db.close()
    
    def test_contradiction_detection(self, test_db, test_incident):
        """Fact with opposite polarity to hypothesis creates contradiction."""
        get_db_func, _ = test_db
        db = next(get_db_func())
        
        # First: hypothesis that DB is failing
        utterance1 = Utterance(
            
            incident_id=test_incident.id,
            event_id="evt-3",
            speaker_name="Alice",
            text="I think DB is failing.",
            normalized_text="i think db is failing.",
            parser_type="hypothesis",
            parser_method="deterministic",
            confidence="high",
            topic="db"
        )
        db.add(utterance1)
        db.commit()
        
        parse_result1 = parser_service.parse("I think DB is failing.", "Alice")
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance1,
            parsed=parse_result1
        )
        
        hypothesis_node = db.query(GraphNode).filter(GraphNode.source_utterance_id == utterance1.id).first()
        
        # Second: fact that DB is healthy (contradiction)
        utterance2 = Utterance(
            
            incident_id=test_incident.id,
            event_id="evt-4",
            speaker_name="Bob",
            text="Metrics show DB is healthy.",
            normalized_text="metrics show db is healthy.",
            parser_type="fact",
            parser_method="deterministic",
            confidence="high",
            topic="db"
        )
        db.add(utterance2)
        db.commit()
        
        parse_result2 = parser_service.parse("Metrics show DB is healthy.", "Bob")
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance2,
            parsed=parse_result2
        )
        
        # Check that hypothesis was faded due to contradiction
        db.refresh(hypothesis_node)
        assert hypothesis_node.status == "faded"
        
        # Check that contradiction edge was created
        edges = db.query(GraphEdge).filter(
            GraphEdge.incident_id == test_incident.id,
            GraphEdge.type == "contradicts"
        ).all()
        assert len(edges) > 0
        
        db.close()
    
    def test_action_creates_node_and_item(self, test_db, test_incident):
        """Action utterance creates both GraphNode and ActionItem."""
        get_db_func, _ = test_db
        db = next(get_db_func())
        
        utterance = Utterance(
            
            incident_id=test_incident.id,
            event_id="evt-5",
            speaker_name="Dave",
            text="I will take the rollback.",
            normalized_text="i will take the rollback.",
            parser_type="action",
            parser_method="deterministic",
            confidence="high",
            topic="deployment"
        )
        db.add(utterance)
        db.commit()
        
        parse_result = parser_service.parse("I will take the rollback.", "Dave")
        
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance,
            parsed=parse_result
        )
        
        node = db.query(GraphNode).filter(GraphNode.source_utterance_id == utterance.id).first()
        assert node is not None
        assert node.type == "action"
        
        from app.models import ActionItem
        action_item = db.query(ActionItem).filter(ActionItem.source_utterance_id == utterance.id).first()
        assert action_item is not None
        assert action_item.proposed_owner == "Dave"
        assert action_item.status == "committed"
        
        db.close()
    
    def test_decision_node_creation(self, test_db, test_incident):
        """Decision utterance creates decision node."""
        get_db_func, _ = test_db
        db = next(get_db_func())
        
        utterance = Utterance(
            
            incident_id=test_incident.id,
            event_id="evt-6",
            speaker_name="Dave",
            text="Let's roll back the deployment.",
            normalized_text="let's roll back the deployment.",
            parser_type="decision",
            parser_method="deterministic",
            confidence="high",
            topic="deployment"
        )
        db.add(utterance)
        db.commit()
        
        parse_result = parser_service.parse("Let's roll back the deployment.", "Dave")
        
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance,
            parsed=parse_result
        )
        
        node = db.query(GraphNode).filter(GraphNode.source_utterance_id == utterance.id).first()
        assert node is not None
        assert node.type == "decision"
        assert node.status == "active"
        
        db.close()
    
    def test_question_node_creation(self, test_db, test_incident):
        """Question utterance creates question node."""
        get_db_func, _ = test_db
        db = next(get_db_func())
        
        utterance = Utterance(
            
            incident_id=test_incident.id,
            event_id="evt-7",
            speaker_name="Eve",
            text="What is the customer impact?",
            normalized_text="what is the customer impact?",
            parser_type="question",
            parser_method="deterministic",
            confidence="medium",
            topic="general"
        )
        db.add(utterance)
        db.commit()
        
        parse_result = parser_service.parse("What is the customer impact?", "Eve")
        
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance,
            parsed=parse_result
        )
        
        node = db.query(GraphNode).filter(GraphNode.source_utterance_id == utterance.id).first()
        assert node is not None
        assert node.type == "question"
        assert node.status == "active"
        
        db.close()
    
    def test_negated_decision_rejected(self, test_db, test_incident):
        """Negated decision creates rejected node."""
        get_db_func, _ = test_db
        db = next(get_db_func())
        
        utterance = Utterance(
            
            incident_id=test_incident.id,
            event_id="evt-8",
            speaker_name="Eve",
            text="We should NOT roll back.",
            normalized_text="[rejected] we should not roll back.",
            parser_type="decision",
            parser_method="deterministic",
            confidence="high",
            topic="deployment",
            negated=True
        )
        db.add(utterance)
        db.commit()
        
        parse_result = parser_service.parse("We should NOT roll back.", "Eve")
        
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance,
            parsed=parse_result
        )
        
        node = db.query(GraphNode).filter(GraphNode.source_utterance_id == utterance.id).first()
        assert node is not None
        assert node.type == "decision"
        assert node.status == "rejected"
        
        db.close()
    
    def test_graph_edges_created(self, test_db, test_incident):
        """Edges are created between nodes."""
        get_db_func, _ = test_db
        db = next(get_db_func())
        
        # Create hypothesis
        utterance1 = Utterance(
            
            incident_id=test_incident.id,
            event_id="evt-9",
            speaker_name="Carol",
            text="I think cache is the issue.",
            normalized_text="i think cache is the issue.",
            parser_type="hypothesis",
            parser_method="deterministic",
            confidence="high",
            topic="cache"
        )
        db.add(utterance1)
        db.commit()
        
        parse_result1 = parser_service.parse("I think cache is the issue.", "Carol")
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance1,
            parsed=parse_result1
        )
        
        # Create decision on same topic
        utterance2 = Utterance(
            
            incident_id=test_incident.id,
            event_id="evt-10",
            speaker_name="Dave",
            text="Let's restart Redis.",
            normalized_text="let's restart redis.",
            parser_type="decision",
            parser_method="deterministic",
            confidence="high",
            topic="cache"
        )
        db.add(utterance2)
        db.commit()
        
        parse_result2 = parser_service.parse("Let's restart Redis.", "Dave")
        graph_service.process_utterance(
            db=db,
            incident_id=test_incident.id,
            utterance=utterance2,
            parsed=parse_result2
        )
        
        # Check edges exist
        edges = db.query(GraphEdge).filter(
            GraphEdge.incident_id == test_incident.id
        ).all()
        assert len(edges) > 0
        
        db.close()
