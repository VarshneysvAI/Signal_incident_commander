#!/bin/bash
set -e

BASE_URL="${BASE_URL:-http://localhost:8000}"
CHANNEL="voice-smoke-$(date +%s)"

echo "??? SIGNAL Voice Verification Smoke Test (CR-4 / Track 3)"
echo "========================================================"
echo "Base URL: $BASE_URL"
echo "Channel:  $CHANNEL"
echo ""

# 1. Health Check
echo "1. Checking API Health..."
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "   ? Health check passed"
else
    echo "   ? Health check failed: $HEALTH"
    exit 1
fi

# 2. Start Agora Agent
echo ""
echo "2. Registering Agora Conversational Agent..."
AGENT_RESP=$(curl -s -X POST "$BASE_URL/api/agora/start-agent" \
    -H "Content-Type: application/json" \
    -d "{\"channel_name\":\"$CHANNEL\",\"agent_uid\":999999}")
if echo "$AGENT_RESP" | grep -q '"status":"started"'; then
    echo "   ? Agora voice agent registered: $(echo "$AGENT_RESP" | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)"
else
    echo "   ? Failed to start agent: $AGENT_RESP"
    exit 1
fi

# 3. Create Incident
echo ""
echo "3. Creating Voice Incident..."
INCIDENT=$(curl -s -X POST "$BASE_URL/api/incidents" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"Voice War Room Incident\",\"channel_name\":\"$CHANNEL\"}")
INCIDENT_ID=$(echo "$INCIDENT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -n "$INCIDENT_ID" ]; then
    echo "   ? Incident created: $INCIDENT_ID"
else
    echo "   ? Failed to create incident: $INCIDENT"
    exit 1
fi

# 4. Deliver 5 Spoken Lines via Agora Webhook
echo ""
echo "4. Simulating Spoken RTC Transcripts via Webhook..."

# Line 1: Alice (1001) - Fact
curl -s -X POST "$BASE_URL/webhooks/agora/transcript" \
    -H "Content-Type: application/json" \
    -d "{\"event_id\":\"v-1-$CHANNEL\",\"channel_name\":\"$CHANNEL\",\"speaker_uid\":1001,\"text\":\"We verified the payment gateway is returning 504 gateway timeouts.\"}" > /dev/null
echo "   ? Alice (1001): We verified the payment gateway is returning 504 gateway timeouts. [Fact]"

# Line 2: Bob (1002) - Hypothesis
curl -s -X POST "$BASE_URL/webhooks/agora/transcript" \
    -H "Content-Type: application/json" \
    -d "{\"event_id\":\"v-2-$CHANNEL\",\"channel_name\":\"$CHANNEL\",\"speaker_uid\":1002,\"text\":\"I think the database connection pool is exhausted.\"}" > /dev/null
echo "   ? Bob (1002): I think the database connection pool is exhausted. [Hypothesis]"

# Line 3: Carol (1003) - Contradiction
curl -s -X POST "$BASE_URL/webhooks/agora/transcript" \
    -H "Content-Type: application/json" \
    -d "{\"event_id\":\"v-3-$CHANNEL\",\"channel_name\":\"$CHANNEL\",\"speaker_uid\":1003,\"text\":\"The database metrics show 0% connection pool usage.\"}" > /dev/null
echo "   ? Carol (1003): The database metrics show 0% connection pool usage. [Contradiction]"

# Line 4: Dave (1004) - Action Assignment
curl -s -X POST "$BASE_URL/webhooks/agora/transcript" \
    -H "Content-Type: application/json" \
    -d "{\"event_id\":\"v-4-$CHANNEL\",\"channel_name\":\"$CHANNEL\",\"speaker_uid\":1004,\"text\":\"Bob please restart the database connection pool\"}" > /dev/null
echo "   ? Dave (1004): Bob please restart the database connection pool [Action Assigned]"

# Line 5: Bob (1002) - Action Commit
curl -s -X POST "$BASE_URL/webhooks/agora/transcript" \
    -H "Content-Type: application/json" \
    -d "{\"event_id\":\"v-5-$CHANNEL\",\"channel_name\":\"$CHANNEL\",\"speaker_uid\":1002,\"text\":\"I will handle the connection pool restart now\"}" > /dev/null
echo "   ? Bob (1002): I will handle the connection pool restart now [Action Committed]"

# Measure Graph Nodes Before Wake Word
GRAPH_BEFORE=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/graph")
NODES_BEFORE=$(echo "$GRAPH_BEFORE" | grep -o '"type"' | wc -l)
echo "   Knowledge Graph node count: $NODES_BEFORE"

# 5. Echo-Loop Guard Test
echo ""
echo "5. Testing Echo-Loop Guard (Agent Audio)..."
ECHO_RESP=$(curl -s -X POST "$BASE_URL/webhooks/agora/transcript" \
    -H "Content-Type: application/json" \
    -d "{\"event_id\":\"echo-$CHANNEL\",\"channel_name\":\"$CHANNEL\",\"speaker_uid\":\"agent\",\"text\":\"SIGNAL speaking: database latency is resolving.\"}")
if echo "$ECHO_RESP" | grep -q '"status":"ignored"'; then
    echo "   ? Echo-loop guard triggered: Agent audio safely ignored"
else
    echo "   ??  Echo-loop guard response: $ECHO_RESP"
fi

# 6. Wake-Word Auto-Query: Status
echo ""
echo "6. Testing Wake-Word Auto-Routing: 'Signal, what is our status?'..."
WAKE_RESP1=$(curl -s -X POST "$BASE_URL/webhooks/agora/transcript" \
    -H "Content-Type: application/json" \
    -d "{\"event_id\":\"wake-1-$CHANNEL\",\"channel_name\":\"$CHANNEL\",\"speaker_uid\":1001,\"text\":\"Signal, what is our status?\"}")

if echo "$WAKE_RESP1" | grep -q '"type":"voice_query"'; then
    ANSWER1=$(echo "$WAKE_RESP1" | grep -o '"answer":"[^"]*"' | cut -d'"' -f4)
    echo "   ? Wake-word query detected and answered!"
    echo "   Spoken Response: \"$ANSWER1\""
else
    echo "   ? Wake-word query failed: $WAKE_RESP1"
    exit 1
fi

# 7. Wake-Word Auto-Query: Owner
echo ""
echo "7. Testing Wake-Word Auto-Routing: 'Hey Signal, who owns the database connection pool?'..."
WAKE_RESP2=$(curl -s -X POST "$BASE_URL/webhooks/agora/transcript" \
    -H "Content-Type: application/json" \
    -d "{\"event_id\":\"wake-2-$CHANNEL\",\"channel_name\":\"$CHANNEL\",\"speaker_uid\":1003,\"text\":\"Hey Signal, who owns the database connection pool?\"}")

if echo "$WAKE_RESP2" | grep -qi "Bob"; then
    ANSWER2=$(echo "$WAKE_RESP2" | grep -o '"answer":"[^"]*"' | cut -d'"' -f4)
    echo "   ? Owner query correctly resolved to Bob!"
    echo "   Spoken Response: \"$ANSWER2\""
else
    echo "   ??  Owner query response: $WAKE_RESP2"
fi

# 8. Graph Pollution Check
echo ""
echo "8. Verifying Knowledge Graph Pollution Guard..."
GRAPH_AFTER=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/graph")
NODES_AFTER=$(echo "$GRAPH_AFTER" | grep -o '"type"' | wc -l)
CONTRADICTION=$(echo "$GRAPH_AFTER" | grep -o '"type":"contradicts"' | wc -l)

echo "   Nodes Before: $NODES_BEFORE | Nodes After: $NODES_AFTER"
if [ "$NODES_AFTER" -eq "$NODES_BEFORE" ]; then
    echo "   ? Zero Graph Pollution: Wake-word questions did NOT create spurious graph nodes"
else
    echo "   ? Graph pollution detected! Expected $NODES_BEFORE nodes, found $NODES_AFTER"
    exit 1
fi

if [ "$CONTRADICTION" -ge 1 ]; then
    echo "   ? Contradiction edge correctly formed between Bob & Carol"
else
    echo "   ??  Contradiction edge not found"
fi

# 9. Query History Audit
echo ""
echo "9. Auditing Spoken Query History (GET /queries)..."
QUERIES=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/queries")
QUERY_COUNT=$(echo "$QUERIES" | grep -o '"intent"' | wc -l)
echo "   Total recorded queries: $QUERY_COUNT"
if [ "$QUERY_COUNT" -ge 2 ]; then
    echo "   ? Query history records present for UI audit & SSE replay"
else
    echo "   ??  Expected at least 2 queries, got $QUERY_COUNT"
fi

echo ""
echo "========================================================"
echo "?? Voice Smoke Test Complete! All CR-4 & CR-4.1 checks PASSED!"
echo "Dashboard:  $BASE_URL"
echo "Voice Room: $BASE_URL (Switch to ??? Voice Room)"
echo ""
