#!/bin/bash
# SIGNAL Commander Smoke Test Script
# Tests end-to-end functionality

set -e

BASE_URL="http://localhost:8000"

echo "🚀 SIGNAL Commander Smoke Test"
echo "=============================="

# Create incident
echo "1. Creating incident..."
INCIDENT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/incidents" \
  -H "Content-Type: application/json" \
  -d '{"title":"Payment Outage","channel_name":"payment-alerts"}')

INCIDENT_ID=$(echo $INCIDENT_RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   Created incident: $INCIDENT_ID"

# Add utterances
echo "2. Adding utterances..."

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

echo "   Added 6 utterances"

# Get graph
echo "3. Checking knowledge graph..."
GRAPH_RESPONSE=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/graph")
NODE_COUNT=$(echo $GRAPH_RESPONSE | python3 -c "import sys,json; print(len(json.load(sys.stdin)['nodes']))")
EDGE_COUNT=$(echo $GRAPH_RESPONSE | python3 -c "import sys,json; print(len(json.load(sys.stdin)['edges']))")

echo "   Nodes: $NODE_COUNT, Edges: $EDGE_COUNT"

if [ "$NODE_COUNT" -lt 6 ]; then
  echo "❌ FAIL: Expected at least 6 nodes"
  exit 1
fi

# Check for contradiction edge
CONTRADICTION_COUNT=$(echo $GRAPH_RESPONSE | python3 -c "import sys,json; print(sum(1 for e in json.load(sys.stdin)['edges'] if e['type']=='contradicts'))")
echo "   Contradictions: $CONTRADICTION_COUNT"

if [ "$CONTRADICTION_COUNT" -lt 1 ]; then
  echo "❌ FAIL: Expected at least 1 contradiction"
  exit 1
fi

# Query status
echo "4. Testing query engine..."
QUERY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/incidents/$INCIDENT_ID/query" \
  -H "Content-Type: application/json" \
  -d '{"speaker_name":"Tester","text":"Signal, what is our status?"}')

ANSWER=$(echo $QUERY_RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['answer'])")
echo "   Answer: ${ANSWER:0:100}..."

# Export markdown
echo "5. Testing export..."
EXPORT_RESPONSE=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/export?format=markdown")

if echo "$EXPORT_RESPONSE" | grep -q "Unresolved Risks"; then
  echo "   ✓ Export contains Unresolved Risks section"
else
  echo "❌ FAIL: Export missing Unresolved Risks section"
  exit 1
fi

# Get actions and confirm one
echo "6. Testing action confirmation..."
ACTIONS_RESPONSE=$(curl -s "$BASE_URL/api/incidents/$INCIDENT_ID/actions")
ACTION_ID=$(echo $ACTIONS_RESPONSE | python3 -c "import sys,json; actions=json.load(sys.stdin); print(actions[0]['id']) if actions else print('')")

if [ -n "$ACTION_ID" ]; then
  CONFIRM_RESPONSE=$(curl -s -X POST "$BASE_URL/api/actions/$ACTION_ID/confirm" \
    -H "Content-Type: application/json" \
    -d '{"owner_name":"Dave"}')
  
  STATUS=$(echo $CONFIRM_RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  echo "   Action $ACTION_ID confirmed with status: $STATUS"
fi

echo ""
echo "✅ All smoke tests passed!"
echo "=========================="
