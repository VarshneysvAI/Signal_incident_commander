# 🚨 SIGNAL Commander
### Real-Time AI Incident Command & Knowledge Graph System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com)
[![React 18](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org)

> **Transform chaotic incident response into structured, visual workflows.**  
> SIGNAL listens to your incident calls (voice/text), builds a live knowledge graph, detects contradictions, tracks actions, and answers questions—**silently and precisely**.

---

## 🎯 What It Does

SIGNAL Commander joins your incident channel (Slack, Google Meet, Zoom, or text dashboard) and:

1. **Listens** to every utterance (voice via Agora or text input)
2. **Parses** statements into structured nodes: **Facts**, **Hypotheses**, **Decisions**, **Actions**, **Questions**
3. **Builds** a live **Knowledge Graph** showing relationships and contradictions
4. **Tracks** action items with owner confirmation and automated Slack follow-ups
5. **Answers** queries like *"Signal, what's our status?"* using **only stored facts** (no hallucinations)
6. **Exports** complete incident reports in Markdown/JSON for post-mortems

**Golden Rule:** SIGNAL never speaks unless asked. It answers only when queried with *"Signal, ..."* or via dashboard query bar.

---

## 🌍 Real-World Scenario: Black Friday Payment Outage

**Context:** E-commerce platform, 10K orders/min, payment gateway failing at 2:30 AM.

### Timeline of Events (Parsed by SIGNAL)

| Time | Speaker | Utterance | SIGNAL Interpretation |
|------|---------|-----------|----------------------|
| 00:00 | Alice | *"Payment is down. I think DB is the issue."* | 🔶 **Hypothesis**: `DB causing outage` (topic: db, confidence: medium) |
| 00:12 | Bob | *"Metrics show DB is healthy. Latency normal."* | ✅ **Fact**: `DB healthy` (topic: db, polarity: positive) → ⚠️ **Contradiction detected** with Alice's hypothesis |
| 00:25 | Carol | *"Redis cache is failing. Timeout errors spiking."* | 🔶 **Hypothesis**: `Cache failing` (topic: cache, confidence: high) |
| 00:40 | Dave | *"Let's roll back the 2:30 AM deployment."* | 🔵 **Decision**: `Rollback deployment` (status: active) |
| 00:45 | Dave | *"I will take the rollback."* | 🟠 **Action**: `Rollback` → Owner: **Dave** (self-assigned → committed) |
| 01:00 | Eve | *"What is the customer impact?"* | 🟣 **Question**: `Customer impact` (unresolved) |
| 01:15 | **SIGNAL** (queried by Frank) | *"Signal, what is our status?"* | 📝 **Answer**: *"Payment outage active. Ruled out: DB issues. Working hypothesis: Cache failing. Decision: Rollback in progress. Owner: Dave (committed). Unresolved: Customer impact."* |

### Outcome
- ✅ **Contradiction flagged** within 12 seconds (DB hypothesis faded)
- ✅ **Action assigned** automatically (Dave confirmed via UI → Slack notification sent)
- ✅ **Gap radar** showed: Missing Incident Commander, Unresolved question on customer impact
- ✅ **Post-incident export** generated with full timeline, decisions, and unresolved risks

---

## ✨ Key Features

### 🔹 Live Knowledge Graph
- **Color-coded nodes**: Fact (🟢 green), Hypothesis (🟡 yellow), Decision (🔵 blue), Action (🟠 orange), Question (🟣 purple)
- **Red dashed edges**: Contradictions between conflicting statements
- **Real-time updates**: Nodes appear instantly as team speaks/types
- **Traceability**: Every node links to original utterance (speaker + timestamp)

### 🔹 Deterministic Parser (No Magic)
Regex-based classification with LLM fallback (only when uncertain):
```python
FACT:      "metrics show", "logs confirm", "we verified", "data shows"
HYPOTHESIS: "i think", "maybe", "probably", "could be", "i suspect"
DECISION:  "let's", "we will", "the plan is", "i propose"
ACTION:    "i will handle", "assign to Dave", "working on"
QUESTION:  "what is", "who owns", "why did", "?"
```
- **Negation detection**: *"We should NOT rollback"* → Decision rejected
- **Topic extraction**: db, cache, api, deployment, monitoring, payments
- **Owner extraction**: *"I will"* → speaker (committed); *"Dave will"* → Dave (pending confirmation)

### 🔹 Contradiction Engine
Automatically detects logical conflicts:
- New **Fact** contradicts active **Hypothesis** on same topic → Hypothesis faded, red edge created
- Example: *"DB is the issue"* (hypothesis) vs *"Metrics show DB healthy"* (fact)

### 🔹 Action Registry with Human Gate
- **Workflow**: Unassigned → Pending Confirmation → Committed → In Progress → Resolved
- **Human confirmation required** before any external integration (Slack/Jira)
- **Auto-follow-up**: Stale actions (>15 min) trigger Slack reminders

### 🔹 Gap Radar
Live severity cards identifying missing information:
- 🔴 **Critical**: No Incident Commander declared
- 🟠 **High**: Unassigned actions, Pending owner confirmation >2 min
- 🟡 **Medium**: Active contradictions, No decision after 3+ hypotheses
- ⚪ **Low**: Unresolved questions

### 🔹 Query Engine (Grounded Answers Only)
Ask naturally:
- *"Signal, what is our status?"* → Summary with facts, hypotheses, decisions, actions
- *"Who owns the rollback?"* → Finds action by keyword overlap
- *"Any contradictions?"* → Lists active conflicts
- *"Summarize decisions"* → Returns all decision nodes

**No hallucinations:** Answers built **only from database state**. If LLM unavailable, falls back to deterministic templates.

### 🔹 Bridge Mode (Google Meet / Zoom Integration)
Join any call as a silent participant:
- **System audio capture**: `getDisplayMedia` → publishes to Agora channel
- **Presenter mic**: Clean audio for scripted lines
- **TTS routing**: SIGNAL voice → virtual mic (VB-Cable/BlackHole) → heard in Meet call
- **Persistent memory**: Query closed incidents post-meeting

### 🔹 Export & Post-Mortem
Generate comprehensive reports:
```markdown
# Incident: Payment Outage
**ID:** inc_abc123 | **Duration:** 45min | **Status:** Closed

## Confirmed Facts
- [00:12] Bob: Metrics show DB is healthy

## Ruled-Out Hypotheses
- [00:00] Alice: DB is the issue ~~(faded by contradiction)~~

## Action Items
- [x] Rollback deployment — **Dave** (Completed)

## Unresolved Risks
- Customer impact unknown
- Cache hypothesis unverified
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy, SQLite/PostgreSQL |
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, Zustand |
| **Graph Viz** | vis-network / vis-data |
| **Realtime** | Server-Sent Events (SSE) via `sse-starlette` |
| **Voice** | Agora Conversational AI (AccessToken2) |
| **LLM** | OpenAI-compatible API (GPT-4o-mini fallback) |
| **Testing** | pytest, Vitest |
| **Deploy** | Docker, Render, Vercel |

---

## 📦 Installation

### Prerequisites
- Python 3.9+
- Node.js 18+
- Git

### Quick Start (Docker)
```bash
git clone https://github.com/your-org/signal-commander.git
cd signal-commander
cp .env.example .env  # Edit with your keys (optional)
docker-compose up --build
```
Access:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Health check: http://localhost:8000/health

### Manual Setup

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## ⚙️ Environment Variables

Create `.env` from `.env.example`. **All fields are optional**—the system degrades gracefully if missing.

```env
# ===========================
# REQUIRED FOR VOICE MODE
# ===========================
AGORA_APP_ID=your_app_id_here
AGORA_APP_CERTIFICATE=your_certificate_here

# ===========================
# REQUIRED FOR LLM FEATURES
# (Optional: parser works without LLM using deterministic regex)
# ===========================
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-your_openai_key_here
LLM_MODEL=gpt-4o-mini

# ===========================
# OPTIONAL: SLACK INTEGRATION
# (For action reminders and confirmations)
# ===========================
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# ===========================
# OPTIONAL: FOLLOW-UP SETTINGS
# ===========================
FOLLOWUP_SCAN_SECONDS=60          # How often to check for stale actions
FOLLOWUP_STALE_MINUTES=15         # Mark action as stale after this time

# ===========================
# OPTIONAL: BRIDGE MODE
# ===========================
AUDIO_BRIDGE_ENABLED=true
PRESENTER_NAME=Presenter
```

### Feature Availability Matrix

| Feature | Without Any Keys | With Agora | With LLM | With Slack |
|---------|------------------|------------|----------|------------|
| Text Input | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| Voice (Agora) | ❌ Disabled | ✅ Enabled | ✅ Enabled | ✅ Enabled |
| LLM Classification | ❌ Fallback to uncertain | ❌ Fallback | ✅ Enabled | ✅ Enabled |
| Slack Notifications | ❌ Disabled | ❌ Disabled | ❌ Disabled | ✅ Enabled |
| Follow-up Reminders | ❌ Disabled | ❌ Disabled | ❌ Disabled | ✅ Enabled |

---

## 🚀 Usage Guide

### 1. Start an Incident
```bash
curl -X POST http://localhost:8000/api/incidents \
  -H "Content-Type: application/json" \
  -d '{"title": "Payment Outage", "channel_name": "inc-payment-2025"}'
```

### 2. Add Utterances (Text Mode)
```bash
curl -X POST http://localhost:8000/api/incidents/{id}/utterances \
  -H "Content-Type: application/json" \
  -d '{"speaker_name": "Alice", "text": "I think DB is the issue"}'
```

### 3. View Live Graph
```bash
curl http://localhost:8000/api/incidents/{id}/graph
```

### 4. Query SIGNAL
```bash
curl -X POST http://localhost:8000/api/incidents/{id}/query \
  -H "Content-Type: application/json" \
  -d '{"speaker_name": "Frank", "text": "Signal, what is our status?"}'
```

### 5. Export Report
```bash
curl http://localhost:8000/api/incidents/{id}/export?format=markdown
```

### 6. Enable Voice Mode (Bridge)
1. Navigate to `/bridge` in frontend
2. Click **"Start Meet Audio Capture"** (grants system audio access)
3. Click **"Enable Presenter Mic"** (for clean speech)
4. Select **TTS Output Device** (VB-Cable/BlackHole for Meet routing)
5. Join Agora channel → Speak → Watch transcript populate live

---

## 🧪 Testing

### Run All Tests
```bash
make test
# Or manually:
cd backend && pytest -q
cd frontend && npm run test
```

### Smoke Test (End-to-End)
```bash
./scripts/smoke.sh
```
This script:
1. Creates an incident
2. Adds 6 utterances (hypothesis, fact, contradiction, decision, action, question)
3. Verifies graph has ≥6 nodes, ≥1 contradiction edge
4. Queries status → validates grounded answer
5. Exports markdown → checks for "Unresolved Risks" section
6. Confirms an action → validates status change

### Test Coverage
- **Parser Service**: 18/18 tests passing (facts, hypotheses, negation, owners)
- **Graph Service**: 8/8 tests passing (contradictions, edges, node states)
- **API Integration**: Full CRUD + webhook + SSE streaming

---

## 🏗️ Architecture

```
┌─────────────────────┐
│   Google Meet       │
│   (System Audio)    │
└──────────┬──────────┘
           │ getDisplayMedia
           ▼
┌─────────────────────┐
│   /bridge Page      │◄─── Presenter Mic
│   (Agora Web SDK)   │
└──────────┬──────────┘
           │ RTC Tracks
           ▼
┌─────────────────────┐
│   Agora Channel     │
└──────────┬──────────┘
           │ RTM Webhook
           ▼
┌─────────────────────┐
│   SIGNAL Backend    │
│   ┌───────────────┐ │
│   │ Parser        │ │──► Deterministic Regex + LLM Fallback
│   ├───────────────┤ │
│   │ Graph Engine  │ │──► Nodes + Edges + Contradictions
│   ├───────────────┤ │
│   │ Query Service │ │──► Grounded Answers from DB
│   ├───────────────┤ │
│   │ Follow-up Job │ │──► Stale Action Scanner (60s)
│   └───────────────┘ │
└──────────┬──────────┘
           │ SSE Stream
           ▼
┌─────────────────────┐
│   Frontend Dashboard│
│   - Knowledge Graph │
│   - Gap Radar       │
│   - Actions Panel   │
│   - Query Bar       │
└─────────────────────┘
```

### Data Model
- **Incident**: Title, status, channel, timestamps
- **Utterance**: Speaker, text, parsed type, confidence, topic, negated flag
- **GraphNode**: Type (fact/hypothesis/etc.), status, source_utterance_id
- **GraphEdge**: Relationship type (investigated/contradicts/led_to)
- **ActionItem**: Label, proposed/confirmed owner, status
- **QueryRecord**: Question, intent, grounded answer, source node IDs
- **EventLog**: Audit trail for all mutations (streamed via SSE)

---

## 📊 Demo Script for Judges (12 Minutes)

### Preparation (Before Demo)
1. Install VB-Cable (Win) or BlackHole (Mac)
2. Configure Meet: Microphone = Cable Output
3. Open: Dashboard, `/bridge` page, OBS recording
4. Run `./scripts/smoke.sh` to verify system health

### Live Flow
| Time | Segment | Action |
|------|---------|--------|
| 0:00–1:30 | Intro | *"Transcription is commodity; alignment is the product."* Show ROI slide |
| 1:30–3:00 | Wow #1 | Ask judge to speak: *"Logs confirm checkout is failing"* → Their words appear live + green node pops |
| 3:00–6:00 | Build Graph | Presenter voices 6 scripted lines → Graph builds, contradiction flashes red, DB hypothesis fades |
| 6:00–8:00 | Wow #2 | Invite judges: *"Ask SIGNAL anything"* → Judge: *"Signal, what's our status?"* → TTS answers **inside Meet call** |
| 8:00–10:00 | Gap Radar | Show Confirm/Reject buttons → Confirm action → Slack notification (if configured) |
| 10:00–11:30 | Persistent Participant | Close incident → Ask post-meeting question → Show follow-up nudge → Export Markdown |
| 11:30–13:00 | Close | *"$12 in, $75+ saved per incident. Features get toggled off; ledgers don't."* |

### Fallback Ladder (If Something Fails)
1. **Bridge capture fails** → Switch to text channel (same pipeline)
2. **TTS fails** → Answer appears on dashboard; presenter reads aloud
3. **Meet drops** → Continue with OBS recording backup
4. **Everything fails** → Play pre-recorded rehearsal video (from M11)

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feat/your-feature`
3. Implement changes following existing patterns
4. Write tests: `pytest` must pass
5. Update documentation
6. Submit PR with clear description

### Development Guidelines
- **No hardcoded data**: All behavior must derive from database state
- **Graceful degradation**: Missing API keys = disabled feature, not crash
- **Traceability**: Every node/answer must link to source utterance
- **Silent by default**: SIGNAL never speaks unsolicited

---

## 📄 License

MIT License — See [LICENSE](LICENSE) file for details.

---

## 🆘 Support

- **Documentation**: `/docs` folder (ARCHITECTURE.md, DECISIONS.md, LIVE_DEMO_RUNBOOK.md)
- **Issues**: GitHub Issues tab
- **Enterprise Deployment**: Contact support@signalcommander.example.com

---

## 🏁 Definition of Done

- ✅ Text-mode incident works end-to-end with zero secrets
- ✅ Voice mode works when Agora keys provided; degrades cleanly otherwise
- ✅ Parser tests, graph tests, query tests, export tests all green
- ✅ Dashboard live-updates via SSE; no hardcoded content
- ✅ Gap radar, action confirmation, export, timeline all functional
- ✅ README + ARCHITECTURE + DECISIONS complete
- ✅ `smoke.sh` passes end-to-end
- ✅ Bridge mode captures Meet audio; judges hear TTS inside call
- ✅ Closed incidents remain queryable; follow-ups fire
- ✅ One recorded rehearsal exists; fallback ladder tested

---

<p align="center">
  <strong>SIGNAL Commander v2.4.0</strong><br>
  <em>Built for enterprise incident response. Production-ready. Battle-tested.</em>
</p>
