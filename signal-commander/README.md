# SIGNAL Commander

Real-time AI Incident Commander that listens to live incident voice rooms and turns conversations into:
- Live knowledge graph (facts, hypotheses, decisions, actions, questions, contradictions)
- Auto-updating incident document
- Continuous incident timeline
- Action registry with ownership tracking
- Gap radar (missing/conflicting information)
- Voice/text query engine
- Markdown/JSON export

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+

### Environment Setup

```bash
cp .env.example .env
# Edit .env and add your keys (see below)
```

### Required Secrets (ask user for these)

```
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
OPENAI_API_KEY=            # or LLM_API_KEY + LLM_BASE_URL
SLACK_WEBHOOK_URL=         # optional
```

Everything works WITHOUT secrets - voice mode and LLM features degrade gracefully.

### Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Run tests
make test

# Full dev environment
make dev
```

### Docker

```bash
docker-compose up
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design.

## API Endpoints

- `GET /health` - System health check
- `POST /api/incidents` - Create new incident
- `GET /api/incidents/{id}` - Get incident details
- `POST /api/incidents/{id}/utterances` - Add text utterance
- `POST /webhooks/agora/transcript` - Agora voice webhook
- `GET /api/incidents/{id}/graph` - Get knowledge graph
- `GET /api/incidents/{id}/document` - Get incident document
- `POST /api/incidents/{id}/query` - Query the system
- `GET /api/incidents/{id}/export?format=markdown|json` - Export incident

## Features

### Silent by Default
SIGNAL never speaks unsolicited. It answers only when queried.

### Never Claim Root Cause
Uses language like "working hypothesis", "ruled out", "confirmed fact".

### Traceability
Every node/answer/export traces to a stored utterance with speaker + timestamp + confidence.

### Dual Input Modes
- Voice mode: Agora transcription webhook
- Text mode: manual utterance API + dashboard input

### Human Confirmation Gate
Required before any external integration call.

## Testing

```bash
# Run all tests
pytest -q

# Smoke test
./scripts/smoke.sh
```

## License

MIT
