# EdgeSight

**Privacy-preserving on-device perception for lightweight browser agents.**
SIH26171 · ISRO · Smart India Hackathon 2026.

**Phase 6A implemented:** browser-local Tesseract.js/WASM OCR and semantic analysis,
local PII detection/redaction, privacy-guarded SafeAgentContext, localhost FastAPI,
and a deterministic planner returning validated CLICK/STOP suggestions.
No real LLM/VLM, browser action execution, or re-observation exists.

The user confirmed the current Chrome flow works before Phase 6A. The new
Chrome-to-server demo and detailed privacy/network checks remain **pending**.
Automated evidence is in [Testing](docs/TESTING.md).

## Run on Windows

From the repository root in PowerShell (Python 3.10+):

```powershell
py -3.10 -m venv server/.venv
server/.venv/Scripts/python.exe -m pip install -r server/requirements.txt
$env:EDGESIGHT_EXTENSION_ORIGIN = "chrome-extension://YOUR_EXTENSION_ID"
Set-Location server
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Replace YOUR_EXTENSION_ID with EdgeSight's 32-letter ID from chrome://extensions.
The app reads process environment; it does not auto-load .env. No API key is needed.
See [server/README.md](server/README.md) for configuration, schema and troubleshooting.

1. Load/reload unpacked `extension/` at chrome://extensions (Chrome 116+).
2. Enable Allow access to file URLs and open `demo-page/index.html` (fake data only).
3. Keep all seven fields and Continue visible. Use the default travel-request goal.
4. Click **ANALYZE / PLAN**. Local OCR has a 45-second deadline; planning has five seconds.
5. Inspect local privacy, Safe agent context and Planner server panels.
6. Inspect **service worker DevTools → Network → POST /plan → Payload**.
   Only structured sanitized context should appear. Both image previews stay local.
7. A complete form with one recognized Continue yields **Planner decision: CLICK Continue**.
   The browser does **not** click. Server failure preserves the local results.

Nothing is sent when the popup merely opens. Every explicit Analyze / Plan performs
a new local observation, then sends its approved context if the privacy gate passes.

## Privacy boundary

```text
Browser screen → local semantic analysis + local pixel OCR
→ local PII detection / field masks / OCR filtering
→ SafeAgentContext → final local privacy guard
========== NETWORK BOUNDARY (localhost JSON only) ==========
FastAPI → deterministic planner → strict observation-bound CLICK / STOP
→ local response validation → suggested action display
```

Only the exact frozen context approved by the Phase 5 privacy builder can be sent.
The transport takes no raw screenshot, raw OCR, DOM observation, secret list,
image handle, or local preview envelope. A private WeakMap approval binds object
identity to the bytes that passed the final known-value guard. Copies and contaminated
candidates are rejected before fetch. It retains safe bytes only, never raw secrets.

**Image upload is deferred to Phase 6B.** The existing Phase 3 sanitized-image
capability remains local. Observation image metadata (dimensions/redaction count) is
in the JSON; no image bytes are sent. Server validation is defence in depth and
does not replace browser sanitization.

The demo privacy scope is known visible DOM fields and conservative text filtering.
Unknown/transformed PII, OCR mistakes, image-only secrets, iframes and shadow DOM
remain limitations; this is not general arbitrary-site privacy certification.

## Development

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
server/.venv/Scripts/python.exe -m pip install -r server/requirements-dev.txt
Set-Location server
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

From the repository root, with FastAPI running: `node scripts/smoke-planner.mjs`.
`npm run build` repackages pinned OCR assets; no npm install is needed to load
the committed extension. No runtime OCR/model downloads.

[Architecture](docs/ARCHITECTURE.md) · [Progress](docs/PROGRESS.md) ·
[Decisions](docs/DECISIONS.md) · [Handoff](docs/HANDOFF.md) ·
[AI context](docs/AI_CONTEXT.md) · [Phase 6A plan](docs/PHASE_6A_PLAN.md)

Next after review: **Phase 6B — ONE real server-side LLM/VLM planner**, preserving
the privacy-safe request and strict response schema. Phase 7 execution and Phase 8
re-observation remain separate future work.
