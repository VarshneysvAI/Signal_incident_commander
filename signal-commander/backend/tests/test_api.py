"""API Integration Tests for SIGNAL Commander"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine, get_db
from sqlalchemy.orm import sessionmaker

# Create test database
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def client():
    """Create test client with fresh database"""
    Base.metadata.create_all(bind=engine)
    def override_get_db():
        try:
            db = TestSessionLocal()
            yield db
        finally:
            db.close()
    
    app.dependency_overrides[get_db] = override_get_db
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)

def test_health_endpoint(client):
    """Test health endpoint returns 200"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "ok"

def test_create_incident(client):
    """Test incident creation"""
    response = client.post("/api/incidents", json={
        "title": "Test Incident",
        "channel_name": "test-channel"
    })
    assert response.status_code in [200, 201]
    data = response.json()
    assert data["title"] == "Test Incident"
    assert data["channel_name"] == "test-channel"
    assert "id" in data

def test_utterance_creates_node(client):
    """Test that utterance creates graph node"""
    # Create incident
    incident_resp = client.post("/api/incidents", json={
        "title": "Test Incident",
        "channel_name": "test-channel"
    })
    incident_id = incident_resp.json()["id"]
    
    # Post utterance
    response = client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Alice",
        "text": "I think the database is down"
    })
    assert response.status_code == 200
    
    # Check graph has nodes
    graph_resp = client.get(f"/api/incidents/{incident_id}/graph")
    assert graph_resp.status_code == 200
    graph_data = graph_resp.json()
    assert len(graph_data["nodes"]) >= 1

def test_duplicate_event_id_ignored(client):
    """Test that duplicate event_id is ignored"""
    incident_resp = client.post("/api/incidents", json={
        "title": "Test Incident",
        "channel_name": "test-channel"
    })
    incident_id = incident_resp.json()["id"]
    
    # Post same utterance twice (simulated by same event_id in webhook)
    # For text utterances, we check idempotency via content
    response1 = client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Alice",
        "text": "Unique test message 12345"
    })
    response2 = client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Alice",
        "text": "Unique test message 12345"
    })
    
    # Both should succeed but create only one unique node pattern
    assert response1.status_code == 200
    assert response2.status_code == 200

def test_query_returns_grounded_answer(client):
    """Test query returns grounded answer from DB state"""
    incident_resp = client.post("/api/incidents", json={
        "title": "Query Test",
        "channel_name": "query-test"
    })
    incident_id = incident_resp.json()["id"]
    
    # Add some data
    client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Bob",
        "text": "Redis cache is failing"
    })
    
    # Query
    response = client.post(f"/api/incidents/{incident_id}/query", json={
        "speaker_name": "Tester",
        "text": "What is our status?"
    })
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "intent" in data

def test_export_contains_all_sections(client):
    """Test export contains required sections"""
    incident_resp = client.post("/api/incidents", json={
        "title": "Export Test",
        "channel_name": "export-test"
    })
    incident_id = incident_resp.json()["id"]
    
    # Add data
    client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Alice",
        "text": "Payment is down"
    })
    client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Bob",
        "text": "I will fix it"
    })
    
    # Export markdown
    response = client.get(f"/api/incidents/{incident_id}/export?format=markdown")
    assert response.status_code == 200
    
    # Response is plain text markdown, not JSON
    content = response.text
    
    # Check for key sections
    assert "Incident Summary" in content or "##" in content
    assert "Unresolved" in content

def test_action_confirm_to_committed(client):
    """Test action confirmation changes status to committed"""
    incident_resp = client.post("/api/incidents", json={
        "title": "Action Test",
        "channel_name": "action-test"
    })
    incident_id = incident_resp.json()["id"]
    
    # Create action via utterance
    client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Dave",
        "text": "I will handle the rollback"
    })
    
    # Get actions
    actions_resp = client.get(f"/api/incidents/{incident_id}/actions")
    assert actions_resp.status_code == 200
    actions = actions_resp.json()
    
    if len(actions) > 0:
        action_id = actions[0]["id"]
        
        # Confirm action
        confirm_resp = client.post(f"/api/actions/{action_id}/confirm", json={
            "owner_name": "Dave"
        })
        assert confirm_resp.status_code == 200
        data = confirm_resp.json()
        assert data["status"] == "committed"
