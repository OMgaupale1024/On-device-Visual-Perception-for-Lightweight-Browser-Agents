# EdgeSight AI Context

Current phase: **Phase 6B — privacy-safe AI planner on NVIDIA NIM, complete in code.**
Provider switched from the OpenAI adapter to NVIDIA NIM. NVIDIA API access was
manually verified by the user (returns valid structured JSON). End-to-end AI demo
remains pending: no NVIDIA_API_KEY was configured in this session's shell, so the
server-side provider smoke and Chrome AI-mode run were not performed. Stop for review
after commit/push. Checkpoint: 2026-09-10.

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
→ NVIDIA NIM (OpenAI-compatible Chat Completions) → untrusted model output → strict action/visual-ID validator
→ SERVER observation binding → unchanged CLICK/STOP JSON → client validation/display.

LLM over sanitized structured visual context, **not a VLM integration**. No image
upload. Raw data and the private sanitized-image capability remain browser-local.

## Phase 6B implementation

- One provider/model: NVIDIA NIM, nvidia/nemotron-3.5-lightning-30b-a3b, base URL
  https://integrate.api.nvidia.com/v1, OpenAI-compatible Chat Completions endpoint
  /chat/completions, temperature=0, stream=false, response_format=json_object,
  chat_template_kwargs.enable_thinking=false, 256 max_tokens, no tools/history/retries.
  Model/base URL are non-secret and overridable via NVIDIA_MODEL / NVIDIA_BASE_URL.
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
- app/nvidia_provider.py: one async httpx adapter (httpx is the OpenAI-compatible HTTP
  client; the openai SDK is not used); NVIDIA_API_KEY read only inside server
  application code, never prompt/config/error/log/browser. Fixed HTTPS URL,
  trust_env=false, no redirects, 64KB response cap, strict single-choice parsing
  (rejects refusal, tool calls, empty/multiple choices).
- app/ai_planner.py: provider protocol seam, deadline, exact output validation,
  supplied visual-ID membership, STOP/null, server-owned observation ID.
- app/main.py: same /plan request and five-key response. AI missing key/network/
  status failures 503; deadline 504; invalid model/refusal output 502; unsafe input
  422. All errors generic. No deterministic fallback in AI mode.
- X-EdgeSight-Planner mode header exposed by narrow CORS and allowlisted by
  transport. Popup shows AI/Deterministic/Unknown, including AI on server-reported
  failures; popup AI label reads "NVIDIA AI". Still suggestions only. No model metrics panel.
- httpx is the production HTTP client and OpenAI-compatible transport; no openai SDK,
  no new framework added.
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

For AI set PLANNER_MODE=ai and supply NVIDIA_API_KEY privately in the server
terminal, then restart. Optional NVIDIA_BASE_URL / NVIDIA_MODEL override the defaults.
Masked key-entry and venv creation instructions are in server/README.md. Default model
in config.py; no other provider integrated.

Reload unpacked extension/ (Chrome 116+), enable file URLs, open demo-page/index.html,
keep all seven fields and Continue visible, and ANALYZE / PLAN. Opening popup alone
does not send. Inspect service worker Network; both previews remain local.

## Important files

Phase 6B: server/app/{config,ai_input,ai_contract,ai_planner,nvidia_provider,main}.py,
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

VERIFIED by user out-of-band: the NVIDIA endpoint/model returns valid structured JSON
(action/target/reason). This was a direct API check, not a run through EdgeSight's
server, parser or privacy projection.

PENDING Phase 6B: (1) real provider call with a server-side NVIDIA_API_KEY exercised
through EdgeSight's parser/validator (scripts/smoke-planner.mjs --ai); (2) Chrome
AI-mode run — local perception READY, privacy SAFE, context READY, server connected,
Planner NVIDIA AI, CLICK actual Continue ID with matching observation and browser not
clicking; (3) actual provider-bound content inspection without auth/header exposure.
No NVIDIA_API_KEY existed in this session's shell, so none were run. Note: the model's
free reason must match one of the four fixed safe phrases or the server returns 502 by
design (json_object mode does not enforce the enum server-side). Mock tests do not
prove model behavior or remote privacy/account settings.

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
CORS is not authentication; local no-Origin clients are allowed. NVIDIA account/data
retention is governed by NVIDIA's policy, not asserted here. json_object structured
output does not enforce the reason enum on the provider side, so a valid-JSON but
off-enum reason is rejected with 502 (no repair). Existing Starlette/httpx deprecation
warning is non-failing.

## Git state and exact next task

Baseline before this checkpoint: **f201778baee1b275642379788f4ea3485555b712**
(feat: add privacy-safe AI planner), main clean and synchronized. This NVIDIA-switch
checkpoint is the commit containing this document, subject
feat: switch AI planner to NVIDIA NIM. Resolve exact hash with git log -1 --format=%H.
Final report records actual normal push, HEAD == origin/main and clean-tree
verification. A commit cannot embed its own hash.

After review: **PHASE 7 — safe browser action execution using the current
observation's visual bounding boxes. DO NOT START PHASE 7 in this session.**
