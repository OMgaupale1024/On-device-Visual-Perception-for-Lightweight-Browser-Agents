# EdgeSight

**Privacy-preserving on-device perception layer for lightweight browser agents.**

Smart India Hackathon 2026 · Problem **SIH26171** — *On-device Visual Perception for Light-weight Browser Agents* · ISRO · Software · Smart Automation.

> **Status: prototype in progress. Phase 0 (foundation) complete.** See [`docs/PROGRESS.md`](docs/PROGRESS.md) for the live status and [`docs/HANDOFF.md`](docs/HANDOFF.md) to continue the work.

---

## The idea in one line

A browser agent shouldn't have to ship your name, email, phone, and password to a
server to figure out "is this form filled — can I click Continue?". EdgeSight does
the perception and privacy work **locally in the browser**, and sends the planner only
a **sanitized, structured** view of the page.

**Never sent off-device:**
```json
{ "email": "rahul@example.com", "phone": "9876543210", "password": "secret123" }
```
**Sent instead:**
```json
{ "role": "email", "value": "[REDACTED]", "filled": true }
```
The agent doesn't need the real email — only that an email field exists and is filled.

## Prototype flow

```
USER GOAL → Chrome extension → observe page locally → detect sensitive info
→ redact/sanitize locally → sanitized structured UI state → planner/server
→ structured action → browser executes → re-observe → verify → continue or stop
```

Core rule: **raw sensitive information must never reach the server.** An outbound
**privacy guard** blocks any payload that still contains a known raw sensitive value.

## Repository layout

```
EdgeSight/
├── extension/     Chrome MV3 extension (perception + privacy + actions)   [Phase 1+]
├── server/        FastAPI planner (deterministic mock first, LLM optional) [Phase 5+]
├── demo-page/     Controlled demo form — FAKE data only                    [Phase 1]
├── docs/          Architecture, progress, decisions, handoff, testing
├── .env.example   Server env template (no secrets)
├── .gitignore
└── README.md
```
Directories under `extension/`, `server/`, etc. are created by the phase that first
fills them — the full intended tree lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## How to run (per component)

Nothing is runnable yet beyond the foundation — components come online phase by phase.
Commands below are the intended entry points; each phase wires up its own.

| Component | Phase | Run (intended) |
|-----------|-------|----------------|
| Demo page | 1 | open `demo-page/index.html` in Chrome |
| Extension | 1 | `chrome://extensions` → Developer mode → Load unpacked → `extension/` |
| Server    | 5 | `cd server && pip install -r requirements.txt && uvicorn app.main:app --reload` |

## Environment

- Chrome (Manifest V3)
- Node v24.x (verified: v24.11.0) — only if extension build tooling is added
- Python 3.10+ (verified: 3.10.11) — for the planner server

## Documentation

| File | Purpose |
|------|---------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Goal, problem statement, components, data & privacy flow, interfaces |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Live status: current phase, done, remaining, blockers, next task |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every significant technical decision + why |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | **Emergency recovery** — how to continue if a session ends |
| [`docs/TESTING.md`](docs/TESTING.md) | Test log: what was tested, input, expected, actual, pass/fail |

## Roadmap

`0` foundation ✅ · `1` extension + demo · `2` local detection · `3` redaction + privacy
guard · `4` sanitized UI state · `5` planner server · `6` safe action exec · `7`
re-observe + verify · `8` metrics · `9` optional visual perception · `10` polish.

## Privacy & security stance

- Detection, redaction, and the privacy guard run **on-device** (in the extension).
- The server receives sanitized data only; the guard blocks any leak before the network layer.
- No secrets in the extension or demo page. API keys (if an LLM is ever used) live only in the server's `.env`.
- Planner responses are validated against a strict action schema — **no `eval`, no arbitrary JS execution.**
