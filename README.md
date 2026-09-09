# EdgeSight

**Privacy-preserving on-device perception layer for lightweight browser agents.**

Smart India Hackathon 2026 · Problem **SIH26171** — *On-device Visual Perception for Light-weight Browser Agents* · ISRO · Software · Smart Automation.

> **Status: prototype in progress. Phase 2 complete** — the extension observes the DOM, captures the visible tab locally, and detects sensitive fields on-device (raw values never leave the browser). See [`docs/PROGRESS.md`](docs/PROGRESS.md) for live status and [`docs/HANDOFF.md`](docs/HANDOFF.md) to continue the work.

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
USER GOAL → Chrome extension → observe page locally (DOM + screenshot) → detect sensitive info
→ redact/sanitize locally → sanitized structured UI state → planner/server
→ structured action → browser executes → re-observe → verify → continue or stop
```

**Hybrid perception:** EdgeSight observes both DOM/semantic signals *and* a locally-captured
screenshot (pixels) — it is not a DOM-only tool. Phase 1 establishes the visual-capture pipeline;
on-device vision (OCR/CV) is Phase 9.

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

The demo page and extension are runnable **now** (Phase 1); the server arrives in Phase 5.

| Component | Phase | Run |
|-----------|-------|-----|
| Demo page | 1 | open `demo-page/index.html` in Chrome (for analysis on `file://`, enable "Allow access to file URLs" for EdgeSight) |
| Extension | 1 | `chrome://extensions` → Developer mode → Load unpacked → `extension/`, then click the toolbar icon → **ANALYZE PAGE** |
| Server    | 5 | `cd server && pip install -r requirements.txt && uvicorn app.main:app --reload` *(not built yet)* |

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

`0` foundation ✅ · `1` extension + demo + visual capture ✅ · `2` local detection ✅ · `3` redaction
+ privacy guard · `4` **local visual perception (core)** · `5` sanitized UI state · `6` planner
server · `7` safe action exec · `8` re-observe + verify · `9` metrics · `10` polish.

## Privacy & security stance

- Detection, redaction, and the privacy guard run **on-device** (in the extension).
- The server receives sanitized data only; the guard blocks any leak before the network layer.
- No secrets in the extension or demo page. API keys (if an LLM is ever used) live only in the server's `.env`.
- Planner responses are validated against a strict action schema — **no `eval`, no arbitrary JS execution.**
