# EdgeSight AI Context

Checkpoint: 2026-09-10. Current phase: **Phase 6A — privacy-safe server transport +
deterministic planner. Complete in code; stopped for review.**

## Project and root objective

EdgeSight · SIH26171 — On-device Visual Perception for Light-weight Browser Agents ·
ISRO. Build browser-local perception and privacy, then safe server planning,
eventually local action execution and re-observation. The latter two are future
work; this checkpoint only returns suggestions.

## Latest architecture

Browser screen → local semantic observation + raw-local-pixel OCR/WASM → local
sensitive detection/redaction/filtering → SafeAgentContext → final local privacy
gate/immutable approval → NETWORK BOUNDARY → localhost FastAPI → deterministic
planner → structured CLICK/STOP → local response validation → popup suggestion.

Image transport is disabled. Observation.image contains dimensions/redaction count
only. Both previews and the separate Phase 3 sanitized-image handle remain local.

## Completed phases and changes

Phases 0–5 exist: Git/docs foundation; MV3 capture/observation; local sensitive-field
classification; Canvas redaction and semantic/known-value guard; real browser-local
Tesseract/WASM OCR and safe boxes/confidence; canonical SafeAgentContext fusion.

Phase 6A adds:
- Private WeakMap in agent-context.js binds the builder's frozen context to the
  exact JSON that passed its final known-value guard. prepareAgentContextForTransport
  verifies identity/freeze/JSON structure/byte equality. Only safe bytes retained.
- transport/config.js and planner-client.js: one loopback endpoint, guarded JSON
  POST, no credentials/redirects/cache, five-second fetch+body timeout, generic
  failures, exact response/action/observation/target checks.
- Service-worker explicit Analyze / Plan integration, clears secret references
  before passing only agent.context; local output preserved on server failure.
- Small planner panel: status, privacy, payload bytes, server, deterministic planner,
  decision; no action executed. Opening popup sends nothing.
- Minimal FastAPI app/main.py, schemas.py and planner.py, pinned requirements,
  exact configured extension-origin CORS, /health, /plan, strict request/response
  schemas and non-echoing validation errors.
- Deterministic supported travel goal: exactly one filled non-withheld field for
  each of seven roles and one Continue text match → CLICK that supplied visual ID.
  Otherwise STOP/null. Observation ID always echoed.
- Transport contamination/failure tests, server validation/planner/CORS tests, shared
  safe fixture and actual HTTP smoke script. No LLM/model provider or action code.

## Important files

- extension/src/privacy/agent-context.js — canonical context and private approval
- extension/src/privacy/guard.js — nested local known-value checks
- extension/src/privacy/redact.js — private sanitized-image handle; unchanged
- extension/src/transport/{config,planner-client}.js — only application transport
- extension/src/background/service-worker.js — trusted local orchestration
- extension/src/popup/popup.{html,js} — safe output/suggestion display
- extension/manifest.json — loopback host permission and port-specific CSP
- server/app/{main,schemas,planner}.py — FastAPI contract and deterministic rules
- extension/tests/transport.test.mjs and server/tests/test_plan.py
- server/tests/safe-context.json — sanitized Phase 5 wire fixture, drift checked
- scripts/smoke-planner.mjs — actual extension client over local HTTP
- docs/PHASE_6A_PLAN.md, server/README.md and docs/TESTING.md

## Actual automated evidence

- npm test: **115/115 Node test entries PASS**, including Phases 1–5 regressions
  and original classifier 7/7 assertions.
- server/.venv/Scripts/python.exe -m unittest discover -s tests -v (from server,
  executable there is .venv/Scripts/python.exe): **24/24 methods PASS**, with
  parameterized schema/privacy/planner/CORS subcases.
- All 5 fake values × goal/field/visual/nested metadata = **20/20 transport blocks**,
  each explicitly asserts fetch count 0 and no leaked value in error.
- npm run check: syntax, manifest and pinned OCR asset hashes PASS.
- Real Uvicorn on 127.0.0.1:8000 + node scripts/smoke-planner.mjs: PASS health,
  CLICK, STOP and observation binding; actual approved synthetic body = 1553 bytes.
- Python syntax compilation, dependency consistency and final diff checks recorded
  in TESTING. These results do not imply Chrome/server manual acceptance.

## Manual tests VERIFIED

Only user-confirmed evidence:
- Historical Phase 1 M1–M4: extension loads, popup opens, analysis returns counts,
  capture Ready with real resolution.
- Historical report: Phase 3 manual test passed and sensitive information appeared
  in the privacy display; no additional detailed check inferred.
- Current user instruction explicitly confirms the existing Chrome flow is working
  before Phase 6A. This supersedes the earlier general awaiting-reload status;
  it does not individually certify the old detailed P4/P5 checklists.

## Manual tests PENDING

Phase 6A start/reload/demo/Analyze / Plan, local privacy SAFE, SafeAgentContext READY,
real POST payload inspection, absence of all five fake values, actual Continue
visual ID returned and displayed, and browser DOES NOT CLICK. Server-offline UI.
Detailed unreported Phase 3–5 mask/recognition/geometry/offline/network/timing/HiDPI
and browser harness checks remain pending. See TESTING for exact procedure.

## Server and extension run

From repository root in Windows PowerShell:

```powershell
py -3.10 -m venv server/.venv
server/.venv/Scripts/python.exe -m pip install -r server/requirements.txt
$env:EDGESIGHT_EXTENSION_ORIGIN = "chrome-extension://YOUR_EXTENSION_ID"
Set-Location server
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Use the actual 32-letter extension ID. Process environment only; .env is not
auto-loaded and no API key is needed. Full instructions: server/README.md.

Reload unpacked extension/ in Chrome 116+, enable file URL access, open
demo-page/index.html, keep seven fields and Continue visible, click ANALYZE / PLAN.
Inspect service worker DevTools Network. OCR assets already committed; no npm
install is needed to load the extension. Local OCR deadline 45s; planner deadline 5s.

## Privacy invariants — do not break

- Transport consumes ONLY approved SafeAgentContext. Never pass full local response,
  raw DOM, screenshot/OCR, known-value list, original preview or image handle.
- Final local known-value gate is primary. Private immutable approval verifies it
  again at send without retaining secrets. No public approval registration/cast API.
- No raw PII/screenshot/OCR logs, storage, files or network. Server errors never
  echo rejected input; no payload logging. Local synthetic test fixtures are safe.
- Future sanitized image transport must use Phase 3's genuine private handle.
- Server validation is defence in depth, not a replacement for local sanitization.
- CLICK targets are supplied visual IDs bound to the same observation; no selectors,
  XPath, executable code or arbitrary server geometry.
- No execution, re-observation, real server AI, cloud or Phase 7/8 changes now.

## Known limitations

Static demo semantics and exact supported travel goal; English OCR may miss or
combine Continue. Unknown/transformed PII and image-only secrets are not solved.
No image upload; confidence may be null; visual text alone does not prove clickability.
Observation binding checks the submitted snapshot, not later live page freshness.
CORS is dev origin filtering, not authentication; no-Origin local clients allowed.
Current Starlette warns that the working httpx TestClient adapter is deprecated.
No measured new Chrome latency or manual payload/no-click pass is claimed.

## Git / working tree checkpoint

Synchronized baseline before modifications: **ae4e37e**, main, clean, up to date.
Latest phase commit: **the commit containing this document**, subject
`feat: add privacy-safe planner transport`; resolve with `git log -1 --format=%H`.
At documentation time the Phase 6A changes are pending commit; delivery requires
normal push, HEAD == origin/main and clean working tree. The final report records
those actual post-commit checks and the exact hash; a commit cannot embed its own
hash. No user edits were present at start. Never force push.

## Exact next task

**Phase 6B — ONE real server-side LLM/VLM planner**, replacing/augmenting the
deterministic planner while preserving the exact privacy-safe request and strict
response schema. Await review. Do not start Phase 6B, Phase 7 or Phase 8 here.
