# EdgeSight

**Privacy-preserving on-device perception for lightweight browser agents.**
SIH26171 · ISRO · Smart India Hackathon 2026.

**Phase 7 implemented in code:** browser-local OCR and semantic analysis, local
redaction, privacy-approved SafeAgentContext, FastAPI validation, one real NVIDIA NIM
planner adapter (deterministic mode is the default), and **safe visually grounded
execution** — a validated `CLICK visual_N` is turned into ONE guarded, user-triggered
click on the locally resolved target. No re-observation/success verification (Phase 8),
metrics dashboard or Raspberry Pi work.

**Phase 6A is manually Chrome-verified by the user:** extension → POST /plan →
FastAPI HTTP 200; seven fields, five sensitive/redacted regions, safe status,
rawPiiIncluded=false, five role placeholders, Bengaluru/Conference retained, and
working deterministic planning. The NVIDIA endpoint was manually verified to return
valid structured JSON. **Phase 6B end-to-end AI verification remains pending:** the
server-side provider smoke through EdgeSight's parser and the Chrome AI-mode run were
not performed (no NVIDIA_API_KEY was configured in this session's shell).

## Run on Windows

From repository root (Python 3.10+):

```powershell
py -3.10 -m venv server/.venv
server/.venv/Scripts/python.exe -m pip install -r server/requirements.txt
$env:EDGESIGHT_EXTENSION_ORIGIN = "chrome-extension://YOUR_EXTENSION_ID"
$env:PLANNER_MODE = "deterministic"
Set-Location server
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Use EdgeSight's actual 32-letter extension ID. For AI mode, set PLANNER_MODE=ai
and NVIDIA_API_KEY **server-side only**, then restart. The
[server README](server/README.md) includes a masked PowerShell key-entry procedure;
never paste a key into the extension, repository, logs or chat. No .env auto-loader.

Reload unpacked extension/ at chrome://extensions (Chrome 116+), enable file URL
access, open demo-page/index.html and keep all seven fields and Continue visible.
Click **ANALYZE / PLAN** with the default travel-request goal. Opening the popup
alone sends nothing. OCR has a 45s limit; planning through localhost has a 20s limit
(provider work is bounded to 15s).

The planner panel displays **NVIDIA AI**, **Deterministic**, or **Unknown** based on an
allowlisted server header. AI failures show unavailable/rejected and never silently
fall back to deterministic success. Local Phase 1–5 results remain visible.

For a `CLICK` plan an **EXECUTE SUGGESTED ACTION** button appears (Phase 7). Pressing it
resolves the chosen `visual_N` locally — screenshot-pixel bbox → CSS viewport point →
`elementFromPoint` → a small clickable-element allowlist — and performs exactly ONE
`element.click()`, bound to the same observation, tab and document, single-use. The UI
then shows **CLICK DISPATCHED**; it does **not** claim the task succeeded (Phase 8 will
verify by fresh perception). A `STOP` plan performs no action. The server never supplies
selectors, coordinates or code.

## Two privacy boundaries

```text
Browser screen → local OCR + semantics → local PII detection/redaction
→ SafeAgentContext → FINAL LOCAL PRIVACY GUARD
========== Browser → EdgeSight server ==========
FastAPI strict validation → minimized safe planning input → provider guard
========== EdgeSight server → NVIDIA NIM (AI mode only) ==========
LLM → untrusted structured decision → strict action/ID validation
→ server-owned observation binding → extension validation → decision display
========== back in the browser (Phase 7, local only) ==========
CLICK visual_N → local bbox → screenshot px → CSS viewport px → elementFromPoint
→ clickable-element allowlist → ONE guarded, single-use click (or STOP: no action)
```

The browser transport still accepts only the exact frozen context approved by the
Phase 5 builder. It has no normal interface to raw screenshots, raw OCR, raw DOM,
secret lists or local previews. Its Phase 6A approval boundary is unchanged.

The provider receives only goal, safe privacy flags, semantic roles/filled flags/
safe values, visual IDs/text/confidence, and the redaction legend. Semantic and
pixel-OCR evidence remain explicitly separate. Observation IDs, timestamps, field
IDs, geometry, image metadata, extension IDs, environment and debug data are omitted.
Authentication uses the server credential as protocol authentication only; it is
never model content.

Selected provider: **NVIDIA NIM**, model **nvidia/nemotron-3.5-lightning-30b-a3b**,
via the OpenAI-compatible Chat Completions endpoint (https://integrate.api.nvidia.com/v1)
with JSON-object structured output. The Python `openai` SDK is not used; the server
speaks the compatible protocol directly over `httpx`. This is an **LLM over sanitized
structured visual context**, not a VLM integration. No image upload; no screenshots
are ever sent to NVIDIA in Phase 6B.

Prompt policy treats goal/screen text as untrusted data, forbids hidden-value
reconstruction, and permits only supplied visual IDs or STOP. All model output is
validated again; reasons use four fixed non-sensitive phrases. Prompt separation
does not guarantee perfect resistance to malicious screen text. Known/unknown PII
limits of local perception also remain; no general arbitrary-site privacy claim.

## Tests and handoff

```powershell
npm test
npm run check
server/.venv/Scripts/python.exe -m pip install -r server/requirements-dev.txt
Set-Location server
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

Current results: **152/152 extension test entries** (32 new Phase 7 geometry, ticket,
execution-policy and element-safety tests), **50/50 server test methods**. Both browser
transport and provider boundary contamination tests pass with zero downstream calls.
Real OCR cold/warm smoke and local deterministic/AI-missing-key HTTP smoke pass. Mocked
AI tests are not real-provider acceptance; the Phase 7 Chrome click demo is manual and
still pending (no key/extension load in the coding shell).

With a separately running server, from repository root:
`node scripts/smoke-planner.mjs` for deterministic mode, or
`node scripts/smoke-planner.mjs --ai` for a real, billable NVIDIA smoke using only the
synthetic safe fixture. The latter was NOT run — no NVIDIA_API_KEY was configured.

[Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) ·
[Progress](docs/PROGRESS.md) · [Decisions](docs/DECISIONS.md) ·
[Handoff](docs/HANDOFF.md) · [AI context](docs/AI_CONTEXT.md) ·
[Phase 6B plan](docs/PHASE_6B_PLAN.md) · [Phase 7 plan](docs/PHASE_7_PLAN.md)

Exact next phase after review: **Phase 8 — re-observation and visual verification: after
the Phase 7 click, fresh capture → new observation → local OCR/CV → confirm the outcome
(e.g. "Travel Request Submitted"). Not started.**
