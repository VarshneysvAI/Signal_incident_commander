#!/bin/bash
set -e

BASE_URL="${BASE_URL:-http://localhost:8000}"
INCIDENT_ID="smoke-test-$(date +%s)"

echo "🔥 SIGNAL Commander Smoke Test"
echo "=============================="
echo "Base URL: $BASE_URL"
echo ""

# Check health
echo "1. Checking health..."
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "   ✅ Health check passed"
else
    echo "   ❌ Health check failed: $HEALTH"
    exit 1
fi

# Create incident
echo ""
echo "2. Creating incident..."
INCIDENT=$(curl -s -X POST "$BASE_URL/api/incidents" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"Payment Outage\",\"channel_name\":\"payments-prod\"}")
INCIDENT_ID=$(echo "$INCIDENT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -n "$INCIDENT_ID" ]; then
    echo "   ✅ Incident created: $INCIDENT_ID"
else
    echo "   ❌ Failed to create incident: $INCIDENT"
    exit 1
fi

# Post 6 utterances
echo ""
echo "3. Posting test utterances..."
curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
    -H "Content-Type: application/json" \
    -d '{"speaker_name":"Alice","text":"Payment is down. I think DB is the issue."}' > /dev/null
echo "   ✓ Alice: Payment is down. I think DB is the issue."

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
    -H "Content-Type: application/json" \
    -d '{"speaker_name":"Bob","text":"Metrics show DB is healthy."}' > /dev/null
echo "   ✓ Bob: Metrics show DB is healthy."

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
    -H "Content-Type: application/json" \
    -d '{"speaker_name":"Carol","text":"Redis cache is failing."}' > /dev/null
echo "   ✓ Carol: Redis cache is failing."

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
    -H "Content-Type: application/json" \
    -d '{"speaker_name":"Dave","text":"Let'\''s roll back the 2:30 AM deployment."}' > /dev/null
echo "   ✓ Dave: Let'\''s roll back the 2:30 AM deployment."

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
    -H "Content-Type: application/json" \
    -d '{"speaker_name":"Dave","text":"I will take the rollback."}' > /dev/null
echo "   ✓ Dave: I will take the rollback."

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
    -H "Content-Type: application/json" \
    -d '{"speaker_name":"Eve","text":"What is the customer impact?"}' > /dev/null
echo "   ✓ Eve: What is the customer impact?"

echo "   ✅ All utterances posted"

# Check graph
echo ""
echo "4. Checking knowledge graph..."
GRAPH=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/graph")
NODE_COUNT=$(echo "$GRAPH" | grep -o '"type"' | wc -l)
CONTRADICTS=$(echo "$GRAPH" | grep -o '"type":"contradicts"' | wc -l)
FADED=$(echo "$GRAPH" | grep -o '"status":"faded"' | wc -l)

echo "   Nodes found: $NODE_COUNT"
echo "   Contradictions: $CONTRADICTS"
echo "   Faded hypotheses: $FADED"

if [ "$NODE_COUNT" -ge 6 ]; then
    echo "   ✅ Node count OK (≥6)"
else
    echo "   ⚠️  Node count low (expected ≥6, got $NODE_COUNT)"
fi

if [ "$CONTRADICTS" -ge 1 ]; then
    echo "   ✅ Contradiction detected"
else
    echo "   ⚠️  No contradiction detected (expected ≥1)"
fi

if [ "$FADED" -ge 1 ]; then
    echo "   ✅ Hypothesis faded correctly"
else
    echo "   ⚠️  No faded hypothesis (expected ≥1)"
fi

# Query test
echo ""
echo "5. Testing query engine..."
QUERY=$(curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/query" \
    -H "Content-Type: application/json" \
    -d '{"speaker_name":"Tester","text":"Signal, what is our status?"}')
if echo "$QUERY" | grep -qi "redis\|rollback\|dave"; then
    echo "   ✅ Query returned grounded answer"
    echo "   Answer: $(echo "$QUERY" | grep -o '"answer":"[^"]*"' | cut -d'"' -f4 | head -c 100)..."
else
    echo "   ⚠️  Query answer may not be grounded: $QUERY"
fi

# Export test
echo ""
echo "6. Testing export..."
EXPORT=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/export?format=markdown")
if echo "$EXPORT" | grep -qi "unresolved"; then
    echo "   ✅ Export contains Unresolved section"
else
    echo "   ⚠️  Export missing Unresolved section"
fi

# Action confirmation
echo ""
echo "7. Testing action confirmation..."
ACTIONS=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/actions")
ACTION_ID=$(echo "$ACTIONS" | grep -oE '"id":\s*[0-9]+' | head -1 | grep -oE '[0-9]+')
if [ -n "$ACTION_ID" ]; then
    CONFIRM=$(curl -s -X POST "$BASE_URL/api/actions/$ACTION_ID/confirm" \
        -H "Content-Type: application/json" \
        -d '{"owner_name":"Dave"}')
    if echo "$CONFIRM" | grep -q '"status":"committed"'; then
        echo "   ✅ Action confirmed to committed"
    else
        echo "   ⚠️  Action confirmation issue: $CONFIRM"
    fi
else
    echo "   ⚠️  No actions found to confirm"
fi

echo ""
echo "=============================="
echo "✅ Smoke test complete!"
echo "Dashboard: $BASE_URL"
echo "API Docs: $BASE_URL/docs"
echo ""
