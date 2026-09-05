"""Voice and Agora Integration Tests for SIGNAL Commander"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine, get_db
from sqlalchemy.orm import sessionmaker

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


def test_agora_start_agent(client):
    """Test POST /api/agora/start-agent endpoint"""
    resp = client.post("/api/agora/start-agent", json={
        "channel_name": "inc-voice-test",
        "agent_uid": 999999,
        "language": "en-US"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "started"
    assert data["channel_name"] == "inc-voice-test"
    assert "agent_uid" in data


def test_agora_webhook_echo_guard(client):
    """Test that agent voice is ignored to avoid echo loops"""
    # 1. By speaker_uid
    resp1 = client.post("/webhooks/agora/transcript", json={
        "event_id": "echo-1",
        "channel_name": "inc-voice-test",
        "speaker_uid": "agent",
        "text": "SIGNAL speaking: database latency is resolving."
    })
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "ignored"
    assert resp1.json()["reason"] == "echo_loop_agent_audio"

    # 2. By speaker_name
    resp2 = client.post("/webhooks/agora/transcript", json={
        "event_id": "echo-2",
        "channel_name": "inc-voice-test",
        "speaker_name": "signal_agent",
        "text": "SIGNAL is active."
    })
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "ignored"

    # 3. By is_agent flag
    resp3 = client.post("/webhooks/agora/transcript", json={
        "event_id": "echo-3",
        "channel_name": "inc-voice-test",
        "is_agent": True,
        "text": "Some spoken TTS feedback"
    })
    assert resp3.status_code == 200
    assert resp3.json()["status"] == "ignored"


def test_agora_webhook_speaker_mapping(client):
    """Test speaker_uid preset mapping to human names"""
    resp = client.post("/webhooks/agora/transcript", json={
        "event_id": "spk-1",
        "channel_name": "inc-voice-test",
        "speaker_uid": 1001,
        "text": "We verified the CPU usage spiked to 98%."
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    incident_id = resp.json()["incident_id"]

    # Verify utterance has Alice as speaker
    utts = client.get(f"/api/incidents/{incident_id}/utterances").json()
    assert len(utts) >= 1
    assert utts[-1]["speaker_name"] == "Alice"


def test_wake_word_auto_routing_and_no_graph_pollution(client):
    """Test wake-word query routes to query engine and does NOT create graph nodes"""
    # 1. Create incident and seed a fact and an action
    inc_resp = client.post("/api/incidents", json={
        "title": "Database Outage Incident",
        "channel_name": "inc-db-outage"
    })
    incident_id = inc_resp.json()["id"]

    # Add a fact
    client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Alice",
        "text": "We verified database response time is 5000ms"
    })

    # Add an action
    client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Dave",
        "text": "Bob please restart the database connection pool"
    })

    # Get graph before wake word query
    graph_before = client.get(f"/api/incidents/{incident_id}/graph").json()
    node_count_before = len(graph_before["nodes"])
    assert node_count_before >= 3  # Root + Fact + Action

    # 2. Trigger wake-word via webhook
    wake_resp = client.post("/webhooks/agora/transcript", json={
        "event_id": "wake-1",
        "channel_name": "inc-db-outage",
        "incident_id": incident_id,
        "speaker_uid": 1001,
        "speaker_name": "Alice",
        "text": "Signal, what is our status?"
    })
    assert wake_resp.status_code == 200
    data = wake_resp.json()
    assert data["type"] == "voice_query"
    assert "Database Outage Incident is active" in data["answer"]

    # 3. CRITICAL: Verify graph node count did NOT increase
    graph_after = client.get(f"/api/incidents/{incident_id}/graph").json()
    node_count_after = len(graph_after["nodes"])
    assert node_count_after == node_count_before, "Wake-word query must NOT create graph nodes!"

    # 4. Trigger wake-word via utterances API
    wake_utt_resp = client.post(f"/api/incidents/{incident_id}/utterances", json={
        "speaker_name": "Carol",
        "text": "Hey Signal, who owns the database connection pool?"
    })
    assert wake_utt_resp.status_code == 200
    utt_data = wake_utt_resp.json()
    assert utt_data["parser_type"] == "query"

    # Verify graph node count still unchanged
    graph_after_utt = client.get(f"/api/incidents/{incident_id}/graph").json()
    assert len(graph_after_utt["nodes"]) == node_count_before

    # 5. Check queries history endpoint
    queries_resp = client.get(f"/api/incidents/{incident_id}/queries")
    assert queries_resp.status_code == 200
    queries = queries_resp.json()
    assert len(queries) >= 2
    # Check that owner query found Bob
    owner_q = next((q for q in queries if "who owns" in q["text"].lower()), None)
    assert owner_q is not None
    assert "Bob" in owner_q["answer"]
