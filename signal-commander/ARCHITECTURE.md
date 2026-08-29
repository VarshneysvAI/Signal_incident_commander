# SIGNAL Commander Architecture

## System Overview

SIGNAL Commander is a real-time AI Incident Commander that processes voice/text input from incident rooms and generates structured knowledge graphs, documents, and action items.

## High-Level Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Agora RTC     │────▶│  FastAPI Backend │────▶│  SQLite/Postgres│
│   (Voice)       │     │  (Python 3.11)   │     │  Database       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   React Frontend │
                        │   (Vite + TS)    │
                        └──────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   vis-network    │
                        │   (Graph Viz)    │
                        └──────────────────┘
```

## Backend Components

### API Layer (`backend/app/api/`)
- `health.py` - System health checks
- `incidents.py` - Incident CRUD operations
- `utterances.py` - Text utterance ingestion
- `graph.py` - Knowledge graph endpoints
- `query.py` - Query engine
- `actions.py` - Action item management
- `export.py` - Markdown/JSON export
- `agora.py` - Agora token generation
- `webhooks.py` - External webhooks (Agora transcript)

### Services Layer (`backend/app/services/`)
- `parser_service.py` - Utterance parsing (deterministic + LLM fallback)
- `llm_service.py` - LLM classification (OpenAI-compatible)
- `graph_service.py` - Knowledge graph construction
- `contradiction_service.py` - Contradiction detection
- `document_service.py` - Document generation
- `query_service.py` - Query answering engine
- `action_service.py` - Action item lifecycle
- `export_service.py` - Export formatting
- `integration_service.py` - External integrations (Slack)
- `agora_service.py` - Agora SDK integration

### Data Models (`backend/app/models.py`)
- **Incident** - Root entity for an incident session
- **Utterance** - Raw input (voice/text) with parsed metadata
- **GraphNode** - Knowledge graph nodes (fact, hypothesis, decision, action, question)
- **GraphEdge** - Relationships between nodes
- **ActionItem** - Trackable action with ownership
- **QueryRecord** - Audit log of queries
- **EventLog** - Real-time event stream for SSE

## Frontend Components

### Core (`frontend/src/`)
- `App.tsx` - Main application shell
- `store.ts` - Zustand state management
- `api/client.ts` - API client utilities
- `types.ts` - TypeScript type definitions
- `hooks/useEventStream.ts` - SSE hook for real-time updates

### UI Components (`frontend/src/components/`)
- `HeaderBar.tsx` - Title, status, controls
- `KnowledgeGraph.tsx` - vis-network graph visualization
- `DocumentPanel.tsx` - Auto-generated incident document
- `TranscriptPanel.tsx` - Live transcript with text input
- `GapRadar.tsx` - Missing/conflicting information display
- `ActionsPanel.tsx` - Action items with confirm/reject
- `QueryBar.tsx` - Natural language query interface
- `ExportButton.tsx` - Export trigger
- `DebugDrawer.tsx` - Developer tools

## Data Flow

### Voice Input Path
1. Agora RTC captures audio in incident room
2. Agora Conversational AI transcribes speech
3. Webhook POST to `/webhooks/agora/transcript`
4. Parser service processes utterance
5. Graph service creates/updates nodes
6. EventLog entry created
7. SSE pushes update to frontend
8. vis-network renders new node

### Text Input Path
1. User types in TranscriptPanel or API call
2. POST to `/api/incidents/{id}/utterances`
3. Same pipeline as voice (steps 4-8)

### Query Path
1. User asks "Signal, what's our status?"
2. POST to `/api/incidents/{id}/query`
3. Query service detects intent
4. Builds answer from database state (templates or grounded LLM)
5. Returns answer with source node IDs
6. Frontend displays answer with citations

## Knowledge Graph Schema

### Node Types
- **incident** (red) - Root incident node
- **fact** (green) - Confirmed information
- **hypothesis** (yellow) - Working theory
- **decision** (blue) - Agreed action plan
- **action** (orange) - Assigned task
- **question** (purple) - Unresolved query
- **off_topic** (gray) - Irrelevant discussion
- **uncertain** (slate) - Needs review

### Edge Types
- **investigated** - Incident → fact/hypothesis
- **supports** - Node supports another node
- **contradicts** - Conflict detected (red dashed)
- **led_to** - Hypothesis led to decision
- **assigned** - Decision assigned to action
- **resolved_by** - Question resolved by fact

## Parser Pipeline

1. **Normalize** - Lowercase, collapse spaces
2. **Deterministic Patterns** - Regex matching for fact/hypothesis/decision/action/question
3. **Negation Detection** - Check for negation words near keywords
4. **Topic Detection** - Map to domain topics (db, cache, api, deployment, monitoring, payments)
5. **Owner Extraction** - Identify action owners
6. **Confidence Scoring** - high/medium/low/uncertain
7. **LLM Fallback** - If uncertain AND LLM configured, classify via API

## Contradiction Engine

Detects contradictions when:
- New fact contradicts active hypothesis (opposite polarity, same topic)
- New hypothesis contradicts confirmed fact
- Two actions claim same ownership (conflict detection)

Resolution: Mark older node as "faded" or "challenged", create contradicts edge.

## Gap Radar Rules

Computed live from database state:
- **Critical** - No incident commander declared
- **High** - Unassigned actions exist
- **Medium** - Pending owner confirmation > 2min, active contradictions
- **Low** - 3+ hypotheses without decision

## Security & Secrets

### Environment Variables
- `AGORA_APP_ID` - Agora application ID
- `AGORA_APP_CERTIFICATE` - Agora app certificate
- `LLM_BASE_URL` - OpenAI-compatible API base URL
- `LLM_API_KEY` - LLM API key
- `LLM_MODEL` - Model name (default: gpt-4o-mini)
- `SLACK_WEBHOOK_URL` - Optional Slack integration
- `AGORA_WEBHOOK_SECRET` - Optional webhook verification

### Graceful Degradation
- No Agora credentials → voice mode disabled, text mode works
- No LLM key → deterministic parser only, uncertain items queued for review
- No Slack webhook → integration calls skipped with logged warning

## Deployment

### Docker Compose
- Backend service (FastAPI + Uvicorn)
- Frontend service (Vite dev server or Nginx for prod)
- SQLite volume persistence

### Environment-Specific Config
- Development: Hot reload, verbose logging
- Production: Worker threads, connection pooling, rate limiting

## Testing Strategy

### Backend Tests (`backend/tests/`)
- `test_parser.py` - Deterministic pattern matching
- `test_graph.py` - Node/edge creation logic
- `test_contradiction.py` - Contradiction detection
- `test_query.py` - Intent detection and answer generation
- `test_export.py` - Markdown/JSON formatting
- `test_actions.py` - Action lifecycle
- `test_api.py` - API contract validation

### Frontend Tests
- Vitest unit tests for components
- Smoke test via bash/curl for E2E flow

### Smoke Test (`scripts/smoke.sh`)
End-to-end validation:
1. Create incident
2. Inject 10 utterances
3. Assert graph structure (6+ nodes, 1+ contradiction)
4. Query status
5. Generate export
6. Confirm action

## Design Decisions

See [DECISIONS.md](./DECISIONS.md) for recorded architectural decisions.
