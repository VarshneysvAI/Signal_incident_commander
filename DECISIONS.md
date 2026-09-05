# Design Decisions Log

This document records architectural and implementation decisions made during SIGNAL Commander development.

---

## Decision 001: SQLite as Default Database

**Date:** M1  
**Status:** Accepted  
**Context:** Need a database that works out-of-the-box for local development but can scale to production.

**Decision:** Use SQLite as default, with SQLAlchemy abstraction allowing easy switch to PostgreSQL via `DATABASE_URL` environment variable.

**Rationale:**
- Zero configuration for local dev
- File-based persistence (`signal.db`)
- SQLAlchemy 2.x provides clean migration path to Postgres
- Adequate performance for MVP scale (single incident room at a time)

**Consequences:**
- Must avoid SQLite-specific features
- Connection pooling less critical for SQLite but required for Postgres mode
- WAL mode enabled for better concurrent read performance

---

## Decision 002: Deterministic Parser First, LLM Fallback Second

**Date:** M2  
**Status:** Accepted  
**Context:** Need reliable utterance classification without depending on external APIs.

**Decision:** Implement regex-based deterministic parser as primary path. Only use LLM when confidence is uncertain AND LLM is configured.

**Rationale:**
- Zero latency for common patterns
- Works without API keys
- Predictable, testable behavior
- LLM only handles edge cases

**Consequences:**
- Must maintain pattern library
- Uncertain items queued for manual review if no LLM
- Parser service must expose both paths clearly

---

## Decision 003: SSE Over WebSocket for Real-Time Updates

**Date:** M3  
**Status:** Accepted  
**Context:** Frontend needs live updates from backend.

**Decision:** Use Server-Sent Events (SSE) instead of WebSockets.

**Rationale:**
- Simpler protocol (unidirectional is sufficient)
- Built-in reconnection handling
- Lower overhead than WebSocket
- Native browser support
- Easier to test with curl

**Consequences:**
- Cannot push from client to server over same channel (not needed)
- Must implement EventLog table as event source
- Frontend uses EventSource API

---

## Decision 004: Event Sourcing Lite via EventLog Table

**Date:** M3  
**Status:** Accepted  
**Context:** Need audit trail and real-time event stream.

**Decision:** Every mutation writes to EventLog table. SSE streams from this table.

**Rationale:**
- Single source of truth for "what happened"
- Enables replay/debugging
- Natural fit for SSE
- Simple implementation (no event store complexity)

**Consequences:**
- EventLog grows unbounded (retention policy needed in M8)
- Must serialize payloads as JSON
- Event types must be enumerated

---

## Decision 005: vis-network for Graph Visualization

**Date:** M4  
**Status:** Accepted  
**Context:** Need interactive knowledge graph visualization.

**Decision:** Use vis-network library (not D3, not Cytoscape).

**Rationale:**
- Purpose-built for network graphs
- Physics simulation built-in
- Good React integration
- Handles dynamic updates well
- MIT licensed

**Consequences:**
- Must learn vis-network API
- Limited customization vs D3
- Bundle size ~200KB

---

## Decision 006: Zustand for State Management

**Date:** M4  
**Status:** Accepted  
**Context:** Need frontend state management.

**Decision:** Use Zustand instead of Redux or Context API.

**Rationale:**
- Minimal boilerplate
- TypeScript-first
- Works well with hooks
- Small bundle size
- Easy to persist/rehydrate

**Consequences:**
- Team must learn Zustand patterns
- DevTools integration requires extra setup

---

## Decision 007: Graceful Degradation Over Hard Failures

**Date:** M7  
**Status:** Accepted  
**Context:** System must work without secrets (Agora, LLM, Slack).

**Decision:** All external integrations degrade gracefully with clear status messages.

**Rationale:**
- Text mode works without Agora
- Deterministic parser works without LLM
- Core features always available
- Better UX than error screens

**Consequences:**
- Must check config availability at runtime
- UI must show disabled states honestly
- Tests must cover both enabled/disabled paths

---

## Decision 008: Traceability via source_utterance_id

**Date:** M3  
**Status:** Accepted  
**Context:** Every graph node must be auditable.

**Decision:** All GraphNodes, GraphEdges, ActionItems reference source Utterance via foreign key.

**Rationale:**
- Answers can cite sources
- Debugging easier
- Meets "traceability" golden rule
- Enables "show me why you said that" feature

**Consequences:**
- Cascade delete must handle chains
- Queries require joins
- Slightly larger payloads

---

## Decision 009: Template Answers First, Grounded LLM Second

**Date:** M5  
**Status:** Accepted  
**Context:** Query engine must answer from stored state, not hallucinate.

**Decision:** Build answers from database templates. Only use LLM for open queries, and ground it in retrieved context.

**Rationale:**
- Zero hallucination risk for standard queries
- Fast responses
- LLM only for complex synthesis
- Source node IDs always tracked

**Consequences:**
- Templates must cover all intents
- LLM path requires validation of returned node IDs
- Must handle "I don't know" gracefully

---

## Decision 010: Dark Enterprise Theme

**Date:** M4  
**Status:** Accepted  
**Context:** Incident commanders work in high-stress, often low-light environments.

**Decision:** Default to dark theme (slate-900 background) with high-contrast accents.

**Rationale:**
- Reduces eye strain during long incidents
- Professional appearance
- Color-coded nodes stand out better
- Industry standard for ops tools

**Consequences:**
- Must ensure WCAG contrast ratios
- Light theme not prioritized for MVP
- Tailwind slate palette fits well

---

## Decision 011: No Authentication in MVP

**Date:** M1  
**Status:** Accepted  
**Context:** Spec does not include auth requirements.

**Decision:** Omit authentication/authorization from MVP. Document as known limitation.

**Rationale:**
- Out of scope per spec (Section 15)
- Adds significant complexity
- Can be added later via reverse proxy (Auth0, Okta, basic auth)

**Consequences:**
- Deploy behind firewall or VPN
- Not for public internet without additional layer
- Clearly documented in README

---

## Decision 012: Retention Policy Deferred to M8

**Date:** M3  
**Status:** Accepted  
**Context:** EventLog and old incidents will accumulate.

**Decision:** Implement simple retention in M8 (configurable days-to-live, cascade delete).

**Rationale:**
- Not critical for MVP functionality
- Allows focus on core features first
- SQLAlchemy makes deletion straightforward

**Consequences:**
- Database grows during testing
- Must add retention endpoint + cron job
- Cascade delete tested in smoke.sh

---

*Last updated: M1-M8 development cycle*
