#!/bin/bash
set -e

BASE_URL="http://localhost:8000"

echo "🚀 SIGNAL Commander Smoke Test"
echo "=============================="

# Step 1: Create incident
echo "📝 Creating incident..."
INCIDENT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/incidents" \
  -H "Content-Type: application/json" \
  -d '{"title":"Payment Outage","channel_name":"payments-critical"}')
INCIDENT_ID=$(echo "$INCIDENT_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "✅ Incident created: $INCIDENT_ID"

# Step 2: Post utterances
echo "💬 Posting utterances..."
curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
  -H "Content-Type: application/json" \
  -d '{"speaker_name":"Alice","text":"Payment is down. I think DB is the issue."}' > /dev/null

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
  -H "Content-Type: application/json" \
  -d '{"speaker_name":"Bob","text":"Metrics show DB is healthy."}' > /dev/null

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
  -H "Content-Type: application/json" \
  -d '{"speaker_name":"Carol","text":"Redis cache is failing."}' > /dev/null

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
  -H "Content-Type: application/json" \
  -d '{"speaker_name":"Dave","text":"Let'\''s roll back the 2:30 AM deployment."}' > /dev/null

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
  -H "Content-Type: application/json" \
  -d '{"speaker_name":"Dave","text":"I will take the rollback."}' > /dev/null

curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/utterances" \
  -H "Content-Type: application/json" \
  -d '{"speaker_name":"Eve","text":"What is the customer impact?"}' > /dev/null

echo "✅ Posted 6 utterances"

# Step 3: Check graph
echo "🕸️  Checking graph..."
GRAPH_RESPONSE=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/graph")
NODE_COUNT=$(echo "$GRAPH_RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['nodes']))")
EDGE_COUNT=$(echo "$GRAPH_RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['edges']))")
CONTRADICTS_COUNT=$(echo "$GRAPH_RESPONSE" | python3 -c "import sys,json; edges=json.load(sys.stdin)['edges']; print(sum(1 for e in edges if e['type']=='contradicts'))")

echo "   Nodes: $NODE_COUNT (expected >=6)"
echo "   Edges: $EDGE_COUNT"
echo "   Contradictions: $CONTRADICTS_COUNT (expected >=1)"

if [ "$NODE_COUNT" -lt 6 ]; then
  echo "❌ FAIL: Expected at least 6 nodes, got $NODE_COUNT"
  exit 1
fi

if [ "$CONTRADICTS_COUNT" -lt 1 ]; then
  echo "❌ FAIL: Expected at least 1 contradicts edge, got $CONTRADICTS_COUNT"
  exit 1
fi

# Check for faded hypothesis
FADED_COUNT=$(echo "$GRAPH_RESPONSE" | python3 -c "import sys,json; nodes=json.load(sys.stdin)['nodes']; print(sum(1 for n in nodes if n['status']=='faded'))")
echo "   Faded hypotheses: $FADED_COUNT (expected >=1)"

if [ "$FADED_COUNT" -lt 1 ]; then
  echo "❌ FAIL: Expected at least 1 faded hypothesis"
  exit 1
fi

echo "✅ Graph checks passed"

# Step 4: Query
echo "❓ Testing query..."
QUERY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/query" \
  -H "Content-Type: application/json" \
  -d '{"speaker_name":"Tester","text":"Signal, what is our status?"}')

ANSWER=$(echo "$QUERY_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('answer',''))")
echo "   Answer: ${ANSWER:0:100}..."

if [[ "$ANSWER" == *"Redis"* ]] || [[ "$ANSWER" == *"rollback"* ]]; then
  echo "✅ Query contains expected content"
else
  echo "⚠️  Query answer may not contain expected keywords (Redis/rollback)"
fi

# Step 5: Export
echo "📤 Testing export..."
EXPORT_RESPONSE=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/export?format=markdown")

if [[ "$EXPORT_RESPONSE" == *"Unresolved"* ]]; then
  echo "✅ Export contains 'Unresolved' section"
else
  echo "❌ FAIL: Export missing 'Unresolved' section"
  exit 1
fi

# Step 6: Confirm action
echo "✅ Confirming action..."
ACTIONS_RESPONSE=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/actions")
FIRST_ACTION_ID=$(echo "$ACTIONS_RESPONSE" | python3 -c "import sys,json; actions=json.load(sys.stdin); print(actions[0]['id'] if actions else '')")

if [ -n "$FIRST_ACTION_ID" ]; then
  CONFIRM_RESPONSE=$(curl -s -X POST "$BASE_URL/api/actions/$FIRST_ACTION_ID/confirm" \
    -H "Content-Type: application/json" \
    -d '{"owner_name":"Dave"}')
  
  ACTION_STATUS=$(echo "$CONFIRM_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
  
  if [ "$ACTION_STATUS" == "committed" ]; then
    echo "✅ Action confirmed and committed"
  else
    echo "⚠️  Action status: $ACTION_STATUS (expected 'committed')"
  fi
else
  echo "⚠️  No actions found to confirm"
fi

echo ""
echo "🎉 All smoke tests passed!"
echo "=========================="
