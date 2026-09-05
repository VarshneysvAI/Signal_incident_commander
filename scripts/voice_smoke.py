#!/usr/bin/env python3
"""
voice_smoke.py - Cross-platform Voice Verification Runner for SIGNAL Commander
Exercises the complete 8-step Voice Runbook (CR-4 & CR-4.1) against local or remote server.
"""
import sys
import time
import requests

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
CHANNEL = f"voice-smoke-{int(time.time())}"

print("=" * 60)
print("???  SIGNAL Commander Voice Verification Suite")
print(f"Base URL: {BASE_URL}")
print(f"Channel:  {CHANNEL}")
print("=" * 60)

# 1. Health
print("\n1. Health Check...")
try:
    h = requests.get(f"{BASE_URL}/health", timeout=5).json()
    assert h.get("status") == "ok"
    print("   ? Health check passed")
except Exception as e:
    print(f"   ? Health check failed: {e}")
    sys.exit(1)

# 2. Register Agent
print("\n2. Registering Agora Agent...")
r = requests.post(f"{BASE_URL}/api/agora/start-agent", json={
    "channel_name": CHANNEL,
    "agent_uid": 999999,
    "language": "en-US"
}).json()
print(f"   ? Agent registered: mode={r.get('mode')} status={r.get('status')}")

# 3. Create Incident
print("\n3. Creating Voice Incident...")
inc = requests.post(f"{BASE_URL}/api/incidents", json={
    "title": "Voice War Room Incident",
    "channel_name": CHANNEL
}).json()
incident_id = inc["id"]
print(f"   ? Incident created: ID={incident_id}, Title='{inc['title']}'")

# 4. Spoken Lines via Webhook
print("\n4. Simulating Voice Webhook Streams...")
lines = [
    (1001, "We verified the payment gateway is returning 504 gateway timeouts.", "Alice [Fact]"),
    (1002, "I think the database connection pool is exhausted.", "Bob [Hypothesis]"),
    (1003, "The database metrics show 0% connection pool usage.", "Carol [Contradiction]"),
    (1004, "Bob please restart the database connection pool", "Dave [Action Assigned]"),
    (1002, "I will handle the connection pool restart now", "Bob [Action Committed]"),
]

for idx, (uid, text, label) in enumerate(lines, 1):
    res = requests.post(f"{BASE_URL}/webhooks/agora/transcript", json={
        "event_id": f"v-{idx}-{CHANNEL}",
        "channel_name": CHANNEL,
        "incident_id": incident_id,
        "speaker_uid": uid,
        "text": text,
    }).json()
    assert res.get("status") == "ok", f"Line {idx} failed: {res}"
    print(f"   ? Line {idx}: ({label}) -> {text}")

# Get Node Count Before Wake Words
g_before = requests.get(f"{BASE_URL}/api/incidents/{incident_id}/graph").json()
nodes_before = len(g_before.get("nodes", []))
print(f"   ?? Knowledge Graph nodes before queries: {nodes_before}")

# 5. Echo-Loop Guard
print("\n5. Testing Echo-Loop Guard (Agent Audio)...")
echo_res = requests.post(f"{BASE_URL}/webhooks/agora/transcript", json={
    "event_id": f"echo-{CHANNEL}",
    "channel_name": CHANNEL,
    "speaker_uid": "agent",
    "text": "SIGNAL speaking: Database outage is currently under investigation."
}).json()
assert echo_res.get("status") == "ignored", f"Echo guard failed: {echo_res}"
assert echo_res.get("reason") == "echo_loop_agent_audio"
print("   ? Echo-loop guard passed: Agent's own audio safely filtered out")

# 6. Wake-Word Status Query
print("\n6. Testing Wake-Word Auto-Routing: 'Signal, what is our status?'...")
wake1 = requests.post(f"{BASE_URL}/webhooks/agora/transcript", json={
    "event_id": f"wake-1-{CHANNEL}",
    "channel_name": CHANNEL,
    "incident_id": incident_id,
    "speaker_uid": 1001,
    "text": "Signal, what is our status?"
}).json()
assert wake1.get("type") == "voice_query", f"Expected voice_query type: {wake1}"
ans1 = wake1.get("answer", "")
assert len(ans1) > 0, "Empty answer returned"
print("   ? Wake-word query detected and auto-answered!")
print(f"   ?? Spoken Answer: \"{ans1}\"")

# 7. Wake-Word Owner Query
print("\n7. Testing Wake-Word Auto-Routing: 'Hey Signal, who owns the database connection pool?'...")
wake2 = requests.post(f"{BASE_URL}/webhooks/agora/transcript", json={
    "event_id": f"wake-2-{CHANNEL}",
    "channel_name": CHANNEL,
    "incident_id": incident_id,
    "speaker_uid": 1003,
    "text": "Hey Signal, who owns the database connection pool?"
}).json()
ans2 = wake2.get("answer", "")
assert "Bob" in ans2, f"Expected Bob in answer: {ans2}"
print("   ? Owner query resolved to Bob!")
print(f"   ?? Spoken Answer: \"{ans2}\"")

# 8. Graph Pollution Guard
print("\n8. Verifying Knowledge Graph Pollution Guard...")
g_after = requests.get(f"{BASE_URL}/api/incidents/{incident_id}/graph").json()
nodes_after = len(g_after.get("nodes", []))
edges = g_after.get("edges", [])
has_contradiction = any(e.get("type") == "contradicts" for e in edges)

print(f"   Nodes Before: {nodes_before} | Nodes After: {nodes_after}")
assert nodes_after == nodes_before, f"Graph polluted! {nodes_after} != {nodes_before}"
print("   ? Zero Graph Pollution: Wake-word queries did NOT generate cluttering graph nodes")
if has_contradiction:
    print("   ? Contradiction edge confirmed in graph")

# 9. Query History Endpoint
print("\n9. Auditing Spoken Query History (GET /queries)...")
queries = requests.get(f"{BASE_URL}/api/incidents/{incident_id}/queries").json()
print(f"   Recorded queries in history: {len(queries)}")
assert len(queries) >= 2, f"Expected at least 2 queries, got {len(queries)}"
print("   ? Query audit records verified")

print("\n" + "=" * 60)
print("?? ALL VOICE CR-4 & CR-4.1 CHECKS PASSED SUCCESSFULLY!")
print("=" * 60)
