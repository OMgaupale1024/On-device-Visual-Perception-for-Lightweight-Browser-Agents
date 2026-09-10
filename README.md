# EdgeSight

**Privacy-preserving on-device perception for lightweight browser agents.**
SIH26171 · ISRO · Smart India Hackathon 2026.

**Phase 6B implemented in code:** browser-local OCR and semantic analysis, local
redaction, privacy-approved SafeAgentContext, FastAPI validation, and one real
OpenAI planner adapter. Deterministic mode remains the default. Both modes return
the exact same observation-bound CLICK/STOP suggestion contract. No browser action
execution, re-observation, metrics dashboard or Raspberry Pi work.

**Phase 6A is manually Chrome-verified by the user:** extension → POST /plan →
FastAPI HTTP 200; seven fields, five sensitive/redacted regions, safe status,
rawPiiIncluded=false, five role placeholders, Bengaluru/Conference retained, and
working deterministic planning. **Phase 6B real-provider/Chrome verification remains
pending:** no server-side API key was available during this implementation.

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
and OPENAI_API_KEY **server-side only**, then restart. The
[server README](server/README.md) includes a masked PowerShell key-entry procedure;
never paste a key into the extension, repository, logs or chat. No .env auto-loader.

Reload unpacked extension/ at chrome://extensions (Chrome 116+), enable file URL
access, open demo-page/index.html and keep all seven fields and Continue visible.
Click **ANALYZE / PLAN** with the default travel-request goal. Opening the popup
alone sends nothing. OCR has a 45s limit; planning through localhost has a 20s limit
(provider work is bounded to 15s).

The planner panel displays **AI**, **Deterministic**, or **Unknown** based on an
allowlisted server header. AI failures show unavailable/rejected and never silently
fall back to deterministic success. Local Phase 1–5 results remain visible.
**CLICK Continue is a suggestion only. The browser does not execute it.**

## Two privacy boundaries

```text
Browser screen → local OCR + semantics → local PII detection/redaction
→ SafeAgentContext → FINAL LOCAL PRIVACY GUARD
========== Browser → EdgeSight server ==========
FastAPI strict validation → minimized safe planning input → provider guard
========== EdgeSight server → OpenAI (AI mode only) ==========
LLM → untrusted structured decision → strict action/ID validation
→ server-owned observation binding → extension validation → suggestion display
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

Selected model: **OpenAI gpt-4.1-mini-2025-04-14**, via Responses API with strict
structured output. This is an **LLM over sanitized structured visual context**, not
a VLM integration. No image upload. See [model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

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

Current results: **120/120 extension test entries**, **50/50 server test methods**.
Both browser transport and provider boundary contamination tests pass with zero
downstream calls. Real OCR cold/warm smoke and local deterministic/AI-missing-key
HTTP smoke pass. Mocked AI tests are not real-provider acceptance.

With a separately running server, from repository root:
`node scripts/smoke-planner.mjs` for deterministic mode, or
`node scripts/smoke-planner.mjs --ai` for a real, billable AI smoke using only the
synthetic safe fixture. The latter was NOT run without a key.

[Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) ·
[Progress](docs/PROGRESS.md) · [Decisions](docs/DECISIONS.md) ·
[Handoff](docs/HANDOFF.md) · [AI context](docs/AI_CONTEXT.md) ·
[Phase 6B plan](docs/PHASE_6B_PLAN.md)

Exact next phase after review: **Phase 7 — safe browser action execution using the
current observation's visual bounding boxes. Not started.**
