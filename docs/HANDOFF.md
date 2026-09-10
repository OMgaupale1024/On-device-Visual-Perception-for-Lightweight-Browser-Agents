# EdgeSight — Phase 7 handoff

**Code complete; stop for review.** The Phase 7 manual Chrome click demo is pending
(unpacked extension not loaded in the coding shell); the Phase 6B real-provider/Chrome
AI check is also still pending (no key configured). No Phase 8 work.

Before changes: git status, git branch, git log --oneline -10, git fetch,
git pull --ff-only; read README and all context/architecture/progress/decisions/
testing docs. Only one AI writes. Code/tests/Git are source of truth.

## Verified baseline

Phases 0–6A implemented. User Chrome-verified Phase 6A: POST /plan → FastAPI HTTP
200; seven fields; five sensitive fields/redacted regions; rawPiiIncluded=false;
privacy.status=safe; five role placeholders; Bengaluru/Conference retained;
deterministic flow working. No additional unreported manual check inferred.

## Phase 6B boundary

PLANNER_MODE=deterministic (default) preserves original planner. Explicit ai mode
uses exactly one provider: NVIDIA NIM, nvidia/nemotron-3.5-lightning-30b-a3b, via the
OpenAI-compatible Chat Completions endpoint at https://integrate.api.nvidia.com/v1.
NVIDIA_API_KEY belongs only in the server process. No key was configured/read/printed
in this session; NVIDIA API access was verified out-of-band by the user.

app/ai_input.py snapshots/revalidates the full candidate, projects only safe
goal/privacy/semantic and pixel-OCR evidence/redaction legend, guards the exact
JSON and caps it. No observation ID/timestamps/bboxes/debug/environment goes to model.
app/ai_contract.py supplies fixed instructions and strict three-key model schema.
app/nvidia_provider.py sends the prompt via async httpx (the OpenAI-compatible HTTP
client; no openai SDK), fixed HTTPS endpoint, response_format=json_object,
enable_thinking=false, no tools/redirects/environment proxies/retries, 15s/64KB bounds.
app/ai_planner.py validates action/target/reason and binds observation on our server.

Same five-key CLICK/STOP response. X-EdgeSight-Planner reports mode separately;
extension allowlists and displays it, including AI on server failures. Browser
deadline 20s. No silent fallback, re-observation or image upload.
This is an LLM over structured visual context, not a VLM integration.

## Phase 7 boundary

Server chooses WHAT (CLICK visual_N); the browser resolves WHERE/HOW locally and never
receives a selector/coordinate/code. actions/geometry.js converts the LOCAL
screenshot-pixel bbox center to a CSS viewport point (scaleX = viewport.width /
screenshot.width per axis; no devicePixelRatio==1 assumption). actions/execute-click.js
holds a LOCAL, single-use ticket bound to observation/target/tab/window/document (never
sent to NVIDIA or FastAPI); ticketForPlan mints it only for a validated CLICK whose
observationId + target match the local context (STOP mints nothing). executeTicket fails
closed on consumed/absent ticket (ACTION_ALREADY_CONSUMED), >60s TTL (STALE_OBSERVATION),
missing/inactive/other tab (TAB_CHANGED), navigated URL (PAGE_CHANGED), bad geometry
(INVALID_GEOMETRY/OUT_OF_VIEWPORT) or sensitive-region overlap (SENSITIVE_REGION), then
consumes and dispatches ONE executeScript pinned to the observed documentId. Injected
clickInPage: viewport re-check, elementFromPoint, walk to a button-like control
(button/input[button|submit]/[role=button]), validate (connected/enabled/visible/
in-rect/uncovered/text-consistent), one element.click(). No re-observation; UI shows
"CLICK DISPATCHED", never task success. Explicit EXECUTE SUGGESTED ACTION button gates it.

## Tests / manual work

50/50 server methods and 152/152 extension entries pass (32 new Phase 7: geometry incl.
non-1:1 pixel density, observation/target binding, tab/page/stale policy, replay,
element safety against a DOM stub); all existing regressions remain. Twenty contamination
cases at direct AI entry and again via /plan each produce zero provider calls. Exact
mocked provider request contains placeholders and no known fake PII/credential/
observation metadata. Twenty-three malicious output cases reject. Injection text stays
separate from policy. Genuine OCR cold/warm, syntax/assets/Python/dependency checks pass.
Real localhost HTTP verifies deterministic 200 and AI missing-key 503 with correct mode
header. No live model call.

Next manual review (Phase 7): reload the extension, Analyze/Plan the Employee Travel
Request (deterministic is fine; NVIDIA AI preferred if a key is available), confirm
Decision CLICK Continue and that the page has NOT changed, then press EXECUTE SUGGESTED
ACTION and confirm the real Continue button is clicked and the page shows the submitted
view (do NOT claim success verification — that is Phase 8). Also run one negative demo:
switch tab / change page before Execute → BLOCKED, no click. Phase 6B: follow
server/README.md masked NVIDIA_API_KEY setup for AI mode. Server-side NVIDIA smoke and
all Chrome demos remain pending (no key / no extension load this session).

## Run / files / limitations

Full Windows setup: [server README](../server/README.md).
From server/ after process configuration:
```powershell
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Reload extension/, allow file URLs, Analyze / Plan. Optional synthetic real-provider
smoke from root: node scripts/smoke-planner.mjs --ai (requires key; not run here).

Important Phase 7 files: extension/src/actions/{geometry,execute-click}.js,
extension/tests/action.test.mjs, extension/src/background/service-worker.js,
extension/src/popup/popup.{html,js}, extension/src/shared/messages.js, manifest.json
(0.7.0). Phase 6B: app/{ai_input,ai_contract,ai_planner,nvidia_provider,config,main}.py,
test_ai_planner.py, transport/config + planner-client. Preserve the untouched
Phase 5/6A approval/sanitized handle/schemas/deterministic planner and all regressions.
Unknown PII/OCR errors, model semantic mistakes, prompt-injection limits, fixed reason
vocabulary, dev CORS limits remain; Phase 7 clicks only button-like targets and never
verifies task success (Phase 8). The existing Starlette TestClient warning is non-failing.

Baseline commit 46a8ac8 (feat: switch AI planner to NVIDIA NIM). Phase 7 commit subject:
feat: add safe visually grounded browser execution. The commit containing this handoff
is the checkpoint; git log -1 --format=%H resolves its hash. Final report records push
and clean-tree verification. No keys, .env, provider dumps, captures, node_modules, venv
or caches in commits; never force push.

Exact next task after review: **PHASE 8 — re-observation and visual verification: fresh
capture after the Phase 7 click → new observation → local OCR/CV → confirm the outcome
(e.g. "Travel Request Submitted"). Not started.**
