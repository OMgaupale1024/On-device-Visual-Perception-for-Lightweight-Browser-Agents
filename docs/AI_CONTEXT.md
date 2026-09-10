# EdgeSight AI Context

Current phase: **Phase 6B — privacy-safe AI planner, complete in code.**
Real-provider/manual AI demo remains pending: no provider key was configured.
Stop for review after commit/push. Checkpoint: 2026-09-10.

## Project/root objective

EdgeSight · SIH26171 — On-device Visual Perception for Light-weight Browser Agents ·
ISRO. Browser-local visual perception and privacy, safe server planning, eventually
local execution/re-observation. This checkpoint returns suggestions only.

## Completed phases / verified state

Phases 0–5 implemented: foundation, MV3 observation/capture, local sensitive
classification, Canvas redaction/guard, Tesseract/WASM OCR, SafeAgentContext fusion.

**Phase 6A implemented and manually Chrome-verified by user.** Exact confirmation:
Chrome extension → POST /plan → FastAPI → HTTP 200; fields=7,
sensitiveFieldCount=5, redactedRegionCount=5, rawPiiIncluded=false,
privacy.status=safe. [NAME], [EMAIL], [PHONE], [EMPLOYEE_ID], [PASSWORD] replaced
sensitive values. Bengaluru and Conference remained. Deterministic flow working.
No additional unreported individual check is marked passed.

Historical Phase 1 M1–M4 and Phase 3 privacy-display confirmation remain in TESTING.

## Latest architecture

Browser screen → local capture + local OCR/CV and semantics → local PII
detection/redaction/filtering → SafeAgentContext → final local guard/approval
→ browser/server boundary → FastAPI strict validation
→ deterministic planner OR explicit AI mode:
full candidate revalidation → minimized JSON input → provider privacy check
→ OpenAI Responses API → untrusted model output → strict action/visual-ID validator
→ SERVER observation binding → unchanged CLICK/STOP JSON → client validation/display.

LLM over sanitized structured visual context, **not a VLM integration**. No image
upload. Raw data and the private sanitized-image capability remain browser-local.

## Phase 6B implementation

- One provider/model: OpenAI gpt-4.1-mini-2025-04-14, fixed endpoint /v1/responses,
  strict structured output, store=false, 256 output tokens, no tools/history/retries.
- app/config.py: explicit PLANNER_MODE=deterministic (default) or ai; invalid fails
  startup. 15s provider bound; browser transport updated to 20s.
- app/ai_input.py: JSON snapshot + full SafeAgentContext revalidation before explicit
  projection, final projected guard, 32KB input cap. Only safe goal/privacy,
  semantic roles/filled/value/sensitive, visual IDs/text/confidence, redaction legend.
  Separate local-browser-semantics and local-pixel-ocr sources. Observation ID,
  timestamp, field IDs, bbox/dimensions/debug data are not sent.
- app/ai_contract.py: fixed small policy, data/instruction separation, placeholders
  cannot be reconstructed and only filled=true signals completion. Strict
  action/target/reason schema; four fixed safe reason phrases; duplicate JSON keys
  rejected. No chain-of-thought or free-form explanations.
- app/openai_provider.py: one async httpx adapter; credential read only inside
  server application code, never prompt/config/error/log/browser. Fixed HTTPS URL,
  trust_env=false, no redirects, 64KB response cap, strict completed-message parsing.
- app/ai_planner.py: provider protocol seam, deadline, exact output validation,
  supplied visual-ID membership, STOP/null, server-owned observation ID.
- app/main.py: same /plan request and five-key response. AI missing key/network/
  status failures 503; deadline 504; invalid model/refusal output 502; unsafe input
  422. All errors generic. No deterministic fallback in AI mode.
- X-EdgeSight-Planner mode header exposed by narrow CORS and allowlisted by
  transport. Popup shows AI/Deterministic/Unknown, including AI on server-reported
  failures; still suggestions only. No model metrics panel.
- httpx moved from test-only to production requirements; no new framework or SDK.
- scripts/smoke-planner.mjs now asserts mode; --ai is an opt-in live-provider smoke.

## Configuration / Windows run

Only process environment, no .env auto-loader. .env.example files contain empty
variable names only. Presence-only inspection found no provider variables and no
root/server .env; no secret values were read/displayed. No key-provisioning tool.
No request to a real AI provider was made.

From repo root:
```powershell
server/.venv/Scripts/python.exe -m pip install -r server/requirements.txt
$env:EDGESIGHT_EXTENSION_ORIGIN = "chrome-extension://YOUR_EXTENSION_ID"
$env:PLANNER_MODE = "deterministic"
Set-Location server
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

For AI set PLANNER_MODE=ai and supply OPENAI_API_KEY privately in the server
terminal, then restart. Masked key-entry and venv creation instructions are in
server/README.md. Fixed model in config.py; no other provider/model integrated.

Reload unpacked extension/ (Chrome 116+), enable file URLs, open demo-page/index.html,
keep all seven fields and Continue visible, and ANALYZE / PLAN. Opening popup alone
does not send. Inspect service worker Network; both previews remain local.

## Important files

Phase 6B: server/app/{config,ai_input,ai_contract,ai_planner,openai_provider,main}.py,
server/tests/test_ai_planner.py, extension/src/transport/{config,planner-client}.js,
extension/src/popup/popup.{html,js}, scripts/smoke-planner.mjs, docs/PHASE_6B_PLAN.md.

Do not break prior boundaries: extension/src/privacy/{agent-context,guard,redact}.js,
server/app/schemas.py and planner.py, all existing tests and shared safe-context.json.
Phase 5/6A privacy builder, sanitized handle, manifest/CSP and deterministic logic are
unchanged. Source/tests/Git outrank stale documentation.

## Actual tests

- npm test: **120/120** test entries PASS, including Phase 1–6A regressions and
  original 7/7 classifier assertions.
- From server/: .venv/Scripts/python.exe -m unittest discover -s tests -v:
  **50/50** methods PASS (24 existing + 26 AI), with parameterized cases.
- Direct provider boundary: 5 canaries x goal/field/visual/nested = **20/20 blocked,
  provider calls=0**. /plan repeats the same 20 cases, also zero calls.
- Exact mocked provider HTTP request body: placeholders allowed; all five fake
  values, credential, observation ID, timestamp and geometry absent.
- **23** malicious/malformed output cases rejected; prompt injection remains
  user-role JSON data and cannot change the fixed system prompt/schema validator.
- npm run check, Python compilation, pip check and diff checks PASS.
- Genuine existing Node/WASM synthetic cold/warm OCR smoke PASS; Continue retained,
  one synthetic sensitive line withheld. Not Chrome timing.
- Real local HTTP on temporary port 8011: deterministic 200/CLICK, missing-key AI
  503, correct mode headers and health. Temporary processes stopped. No provider call.

## Manual VERIFIED / PENDING

VERIFIED: the exact Phase 6A user evidence above. Existing historical reports in TESTING.

PENDING Phase 6B: real provider call with server-side key; Chrome local perception
READY, privacy SAFE, context READY, server connected, Planner AI, CLICK actual
Continue ID with matching observation and browser not clicking. Actual provider-bound
content inspection without auth/header exposure is also pending. Mock tests do not
prove model behavior or actual remote privacy/account settings.

Unreported detailed masks, offline OCR, geometry/HiDPI and timing checks remain
pending; do not invent them from the general flow confirmation.

## Privacy / do-not-break rules

- Only private-builder-approved SafeAgentContext leaves the browser. Transport cannot
  normally access raw screenshots/OCR/DOM, known-value lists or local response envelopes.
- Provider gets only the revalidated minimal projection. Never add credentials,
  raw objects, image bytes, observation metadata or debug dumps to prompts.
- No key/payload/provider-output/exception logging or persistence; generic errors.
  Authentication stays on the server in the provider request header only.
- Treat goal/screen text as data. Preserve semantic/visual provenance. Never
  reconstruct placeholder values or treat a placeholder alone as filled.
- Model is untrusted: exact keys/actions, ID membership, STOP/null, safe reason enum,
  server observation binding. Never repair dangerous output or silently fall back.
- Same Phase 6A five-key response; mode remains a separate safe header.
- No image upload, action execution, re-observation, metrics, Pi or multiple providers.
- No force push; only one AI writes; keep docs and manual evidence truthful.

## Known limitations

Real key/model access unverified. Local privacy is scoped to known detected PII;
unknown/transformed secrets and OCR errors can evade heuristics. System prompt
separation is defence in depth, not proof against all prompt injection. Schema/ID
checks constrain outputs but do not prove a chosen action is correct. Execution-time
page freshness remains Phase 7. Fixed reason phrases limit explanation detail.
CORS is not authentication; local no-Origin clients are allowed. store=false does
not certify zero provider retention. Existing Starlette/httpx deprecation warning
is non-failing.

## Git state and exact next task

Baseline: **f356308048cf7ed5afa29ee76e88904552457605**, main clean and synchronized.
Phase 6B checkpoint is the commit containing this document, subject
feat: add privacy-safe AI planner. Resolve exact hash with git log -1 --format=%H.
At doc preparation changes await commit; final report records actual normal push,
HEAD == origin/main and clean-tree verification. A commit cannot embed its own hash.

After review: **PHASE 7 — safe browser action execution using the current
observation's visual bounding boxes. DO NOT START PHASE 7 in this session.**
