# EdgeSight

**Privacy-preserving on-device perception for lightweight browser agents.**
SIH26171 · ISRO · Smart India Hackathon 2026.

**Phases 0–9 implemented in code:** browser-local OCR and semantic analysis, local
redaction, privacy-approved SafeAgentContext, FastAPI validation, one real NVIDIA NIM
planner adapter (deterministic mode is the default), and **safe visually grounded
execution** — a validated `CLICK visual_N` is turned into ONE guarded, user-triggered
click on the locally resolved target. Phase 8 then captures fresh pixels and verifies
the visible outcome locally. Phase 9 adds controlled evaluation benchmarks and actual
current-run timings. No heavy dashboard or Raspberry Pi work.

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
then shows **CLICK DISPATCHED → VERIFYING**. After 750 ms, one fresh capture of the same
active tab runs local OCR and privacy again. Only the full pixel-derived phrase
**Travel Request Submitted** produces **VISUALLY VERIFIED**; otherwise **NOT VERIFIED —
Analyze again**. The result panel shows the before/after observation IDs and safe evidence.
Verification never calls `/plan`, NVIDIA, or another endpoint. A `STOP` plan performs no action. The server never supplies
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
========== Phase 8, browser local only ==========
750 ms → fresh same-tab capture → new observation → local OCR + privacy again
→ safe visual text → Travel Request Submitted → VISUALLY VERIFIED / NOT VERIFIED
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

Current results: **230/230 extension test entries** (23 new Phase 9 tests),
**52/52 server test methods** (2 new Phase 9 tests). Both browser
transport and provider boundary contamination tests pass with zero downstream calls.
Real OCR cold/warm smoke and local deterministic/AI-missing-key HTTP smoke pass. Mocked
AI tests are not real-provider acceptance. Phase 6B integrated NVIDIA, Phase 7 positive/
negative, and Phase 8 positive/negative Chrome demos remain **PENDING**. Chrome was
launched, but Computer Use stopped because it could not reliably determine the current
browser URL for policy enforcement. No manual click or verification pass was observed.

With a separately running server, from repository root:
`node scripts/smoke-planner.mjs` for deterministic mode, or
`node scripts/smoke-planner.mjs --ai` for a real, billable NVIDIA smoke using only the
synthetic safe fixture. The latter was NOT run — no NVIDIA_API_KEY was configured.

[Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) ·
[Progress](docs/PROGRESS.md) · [Decisions](docs/DECISIONS.md) ·
[Handoff](docs/HANDOFF.md) · [AI context](docs/AI_CONTEXT.md) ·
[Phase 6B plan](docs/PHASE_6B_PLAN.md) · [Phase 7 plan](docs/PHASE_7_PLAN.md) ·
[Phase 8 plan](docs/PHASE_8_PLAN.md)

Verification uses one attempt, a 60-second transaction deadline, five-second local API
bounds and the existing 45-second OCR deadline. Navigation is allowed after dispatch;
the intended tab must remain active. Matching normalizes case/whitespace/punctuation
spacing and joins at most three spatially adjacent OCR items in bbox reading order.
Confidence values are recorded without an uncalibrated threshold. This proves visible
text at capture time, not backend persistence or arbitrary workflow completion.

Exact next implementation task: **Phase 10 - final SIH demo polish and submission evidence. Not started.**

## Phase 9 controlled prototype benchmark

Run `npm run benchmark` from the repository root with Node dependencies and the
server venv installed. It runs real pixel OCR on five committed synthetic screens,
the actual PII detector and redaction mask commands, local stages and 10 temporary
deterministic FastAPI HTTP requests. No NVIDIA call by default.

Reference: 41/41 safe items on 5 synthetic screens; PII precision **71.43%**, recall
**75.00%**, F1 **73.17%** on 40 candidates; redaction-command precision **72.09%**,
recall **75.61%**, safe-region preservation **70.73%** across 3 layouts. These are
controlled prototype results, not general accuracy or pixel-perfect masking claims.
Cold OCR median **523.908 ms** (2 new workers); warm inference median **249.229 ms**
(5 runs), measured in Node/WASM. Live Chrome/NVIDIA latency and resource utilization
remain unmeasured. Popup Performance shows only current-run timings, initially --;
human confirmation time is separate from machine processing.

See [Metrics definitions, results and limitations](docs/METRICS.md),
[Phase 9 plan](docs/PHASE_9_PLAN.md) and
[reference judge table](benchmarks/reference/table.md). Phase 9 code is complete;
manual Chrome metrics acceptance remains PENDING.
