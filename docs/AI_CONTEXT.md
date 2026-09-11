# EdgeSight AI Context

Current checkpoint: 2026-09-11. **Completed code: Phases 0-9.**
Phase 8 adds fresh browser-local visual outcome verification after a Phase 7 click.
Phase 9 adds controlled benchmarks and numeric current-run timing instrumentation. Code, tests and Git outrank historical documentation.

## Manual evidence (do not promote unobserved checks)

- Phase 6A: PASS, user-confirmed Chrome -> POST /plan -> FastAPI 200; seven fields,
  five sensitive fields/redacted regions, rawPiiIncluded=false, privacy.status=safe,
  five role placeholders, Bengaluru/Conference retained, deterministic planning.
  Historical Phase 1 M1-M4 and other reported evidence remain in TESTING.md.
- NVIDIA endpoint: user verified out of band. Phase 6B integrated NVIDIA server/Chrome
  run: **PENDING**. No NVIDIA_API_KEY configured in this session's shell; presence-only
  checks, no credential read or printed. No root/server .env. No real provider call.
- Phase 7 positive Continue click: **PENDING**. Stale/wrong-page negative: **PENDING**.
- Phase 8 positive fresh visual verification: **PENDING**. Negative Chrome: **PENDING**.
  Chrome was launched for the requested demo, but Computer Use stopped because it could
  not reliably determine the current browser URL for policy enforcement. No further
  browser input was issued. No extension reload, click or visual verification was observed.
  Automated API/DOM doubles do not substitute for Chrome acceptance.

## Architecture

Explicit Analyze / Plan -> shared local observation -> captureVisibleTab -> local
Tesseract/WASM OCR plus semantics -> PII detection/Canvas redaction/visual filtering
-> builder-approved frozen SafeAgentContext -> localhost FastAPI /plan -> deterministic
OR NVIDIA NIM planner -> validated CLICK visual_N / STOP -> local single-use ticket.
Explicit Execute -> guarded bbox/viewport/elementFromPoint click -> CLICK DISPATCHED
-> 750 ms -> fresh capture in the SAME intended active tab -> NEW observation UUID
and capture timestamp -> fresh local OCR and privacy -> approved safe visual elements
-> local exact phrase verification -> VISUALLY VERIFIED / NOT VERIFIED.

The shared background/local-observation.js has no planner, ticket or network call.
Only runAnalysis in service-worker.js invokes requestPlan and mints tickets.
verify-after-click.js calls observeLocal with an empty local goal; never calls a planner
or creates an action. No new side effect, provider, typing, scrolling or recovery loop.
The original analysis response/approval boundary and server schemas remain intact.

## Phase 8 invariants and policy

- Raw screenshots and raw OCR remain local transient data. Every verification reruns
  the existing sensitive-field classification, value collection, Canvas redaction,
  semantic sanitization, OCR privacy filtering and final known-value/context guard.
  Verification returns only safe metadata, never its screenshots or page text.
- Check intended tab existence/window and active current-window tab before observation;
  shared capture checks active tab before AND after capture; check again after perception.
  TAB_CHANGED fails closed. No old URL or documentId is required after the click.
  The NEW observation pins its own document and compares before/after capture snapshots.
  Navigation during that new capture can fail safely. Capture is not an atomic snapshot.
- New UUID, capturedAt, decoded screenshot dimensions and OCR results each time.
  Matcher rejects equal action/verification IDs or capturedAt <= dispatch timestamp.
  visual_N names restart from fresh OCR; identity is (observation ID, visual ID), never
  a global visual ID. Old bboxes, screenshot, OCR or SafeAgentContext cannot verify.
- Dedicated verify-visual-result.js accepts a builder-approved frozen context and reads
  only visualElements with source=visual for matching. No fields/DOM, planner reason,
  server response or old target is success evidence. Approval validation is local only.
- Fixed spec: {type: 'VISUAL_TEXT', expectedText: 'Travel Request Submitted'}.
  Optional supporting phrase is not required and does not independently count.
- Normalize NFKC, lowercase, trim, repeated whitespace and spacing around . , ! ? ; :.
  Require the full contiguous normalized phrase with Unicode word boundaries.
  Punctuation is retained: 'Travel Request: Submitted' does not match. No fuzzy spelling,
  partial words or request/submitted alone. A visible occurrence is enough; no backend
  persistence, causality, negation understanding or arbitrary-workflow claim.
- Reading order: top-to-bottom fixed rows (>=50% vertical overlap), then left-to-right.
  Join at most three consecutive items. Same-row nonoverlapping fragments must have a
  gap <=2 times their maximum height. Successive lines require horizontal overlap and
  a vertical gap <=1.5 times maximum height. Unrelated columns/distant lines do not join.
- OCR confidence is actual 0-1 or null, recorded per contributing visual ID. No fake
  aggregate or uncalibrated threshold; the five-screen Phase 9 dataset does not justify threshold tuning.
- One attempt after **750 ms** (demo changes synchronously), no retry/replanning/click.
  Local API/redaction awaits: 5s each. Existing OCR bound: 45s. Verification total: 60s,
  abort signal blocks further stages/late acceptance. Already-running platform work may
  finish before references/resources are released; this is not secure memory erasure.
- Fixed result: VERIFIED or NOT_VERIFIED with NO_VISUAL_MATCH, TAB_CHANGED, CAPTURE_FAILED,
  PERCEPTION_FAILED, PRIVACY_FAILED or TIMEOUT; matcher also rejects STALE_OBSERVATION /
  INVALID_SPEC. The existing OCR bridge combines OCR errors/timeouts as PERCEPTION_FAILED;
  its local diagnostic distinguishes OCR_TIMEOUT. No uncontrolled error text returned.
- Actual local timings: dispatchedAt/completedAt (epoch ms), postClickDelayMs, captureMs,
  perceptionMs (OCR plus visual privacy filtering), matchingMs and totalMs (monotonic).
  Failed stages may omit unavailable counters. No dashboard, fabricated metrics or charts.
- Popup: Waiting for action -> VERIFYING -> VISUALLY VERIFIED / NOT VERIFIED + Analyze
  again. Known expected phrase, before/after IDs and actual SAFE privacy only. Original
  guarded Continue target remains visible. Safe result stays in worker memory for popup
  reopening; new analysis resets it, worker teardown loses it. Nothing persisted.
  Analyze/Execute overlap is rejected; verification never triggers another side effect.

## Prior boundaries to preserve

Phase 7: local ticket bound to observation, target, tab/window/document, 60s TTL and
single-use. Screenshot bbox center maps independently per axis to CSS viewport.
Small allowlist: button/input[button|submit]/role=button. Connected, enabled, visible,
nonzero rect, uncovered, text-consistent; one document-pinned executeScript click.
DOM text is an execution safety check only. Server never sends selectors/coordinates/code.

Phase 6B: single NVIDIA NIM nvidia/nemotron-3.5-lightning-30b-a3b via OpenAI-compatible
Chat Completions at https://integrate.api.nvidia.com/v1. httpx, no OpenAI SDK. Server-only
NVIDIA_API_KEY, no credentials in prompts/logs/browser. Minimized revalidated safe JSON,
semantic/pixel provenance, no images/geometry/observation metadata to provider.
Fixed instruction policy, strict untrusted action/target/reason and ID validation,
server-owned observation binding, 15s/64KB bounds, no tools/history/retries/fallback.
The five-key action contract is unchanged; X-EdgeSight-Planner is allowlisted separately.
Deterministic default; ai is explicit. Browser planner timeout 20s. Local results survive
planner failure. This is an LLM over sanitized structured context, not a VLM.

## Important files

- extension/src/background/{service-worker, local-observation}.js
- extension/src/verification/{verify-after-click, verify-visual-result}.js
- extension/src/popup/popup.{html, js, css}, shared/messages.js, manifest.json (0.9.0)
- extension/tests/verification{,-integration,-popup}.test.mjs, docs/PHASE_8_PLAN.md
- Prior actions/{geometry, execute-click}.js, perception/{bridge, pipeline, ocr}.js,
  privacy/{agent-context, guard, redact, visual}.js and all original tests.
- Server app/{config, ai_input, ai_contract, ai_planner, nvidia_provider, main, schemas, planner}.py;
  server/tests/{test_ai_planner, test_plan}.py and safe-context.json. Phase 9 adds numeric Server-Timing headers without changing the action JSON.

## Tests and run

230/230 extension entries PASS (207 prior + 23 Phase 9); 52/52 server methods PASS.
npm run check PASS (syntax/manifest/packaged asset hashes), git diff --check PASS.
Genuine cold/warm Node/WASM OCR synthetic smoke PASS; not a Chrome timing/result claim.
Temporary FastAPI HTTP smoke PASS: deterministic 200/CLICK and ai missing-key 503, correct
mode headers, no provider call; test processes stopped. Interpreter needs sandbox
escalation here; the server venv and all 52 methods work outside the sandbox.
New tests cover fresh pixels/OCR/dimensions/identity, document replacement, tab switches,
privacy canaries absent from result/popup/logs, real bridge timeout, all failures, zero
verification fetch calls, no extra click/plan, deterministic phrase/reading order, safe
popup progress/result/reopen behavior. Original privacy tests are unchanged.

Windows commands/configuration: README.md and server/README.md. Set exact extension
origin, PLANNER_MODE=deterministic (or ai with a privately supplied rotated NVIDIA key),
start Uvicorn on 127.0.0.1:8000 with --no-access-log. Reload extension and reset demo.
Manual steps and exact acceptance evidence: TESTING.md Phase 8.

## Known limitations

Manual Chrome acceptance pending. Single 750 ms capture can miss slower transitions;
no retry. Cross-origin navigation can lose activeTab access and fail closed. OCR may
miss/misread text; English text only, no general CV/VLM. Privacy is heuristic and scoped
to detected/known PII; unknown/transformed secrets can escape detection. Existing model
semantic/prompt-injection limits remain. Capture/tab checks are not atomic and cannot
prove a tab was never briefly switched away and back. Fresh pixels prove only a visible
phrase at capture time. Worker restart loses pending tickets and verification results.
No general automation, additional provider, Raspberry Pi or Phase 10 implementation.

## Phase 9 evaluation architecture and reference

Official mapping: visual context 25%, PII precision/recall 20%, redaction precision
20%, client resources 20%, end-to-end latency 15%. No invented composite score.
See METRICS.md for exact formulas, environment, sample limits and full judge table.

- metrics/metrics.js contains pure statistics, quality scorers and allowlisted numeric
  timing projection. scripts/benchmark.mjs drives real pixel OCR, detector, builder,
  redaction command adapter and Python validation/projection/temporary HTTP helpers.
- benchmarks/fixtures contains 5 small generated fake PNGs + independent labels;
  benchmarks/reference has reviewed version-1 aggregate JSON/table. Default output
  ignored. No automatic browser screenshot persistence or raw OCR in metrics.
- Visual: 5 screens / 41 expected items, 41 correct, 0 missed/unexpected (100% only on
  these synthetic layouts). Exact normalized whole-line source=visual pixel output.
- PII: 40 candidates (20 sensitive, 20 safe); TP 15 FP 6 FN 5 TN 14. Precision71.43%,
  recall 75%, F1 73.17%. Unsupported aliases and misleading safe labels remain errors.
- Redaction: 3 layouts, 41 sensitive/41 safe regions, 43 final mask commands; 31 correct,
  10 missed, 12 unnecessary; precision 72.09%, recall 75.61%, preservation70.73%. Greedy
  one-to-one IoU>=0.5, any safe overlap damages region. Adapter, not native pixels.
- Runtime: 2 worker-cold OCR runs median 523.908 ms; 5 warm inference runs median 249.229 ms;
  10 cheap stage runs each, 30 mixed redaction adapter timings; 10 real deterministic
  HTTP requests median 1.904 ms (mean 5.946, max 19.006, all200). Not Chrome plan latency.
- 11092523 local OCR asset bytes (19 files, includes notices), 1553 UTF-8 context/request
  bytes, 1058 provider-projected user-content bytes. Not runtime RAM or universal payload.
- Reference measured 2026-09-11T00:10:52.714Z: Windows10.0.26200x64, AMD Ryzen9 5900HX,
  16 logical CPUs, Node24.11.0, Python3.10.11, Tesseract6.0.1/core6.1.2/English/PSM11.
  Browser/GPU unknown. Every raw numeric run and source/fixture hash in reference JSON.
- Worker local timers cover capture, detector/redaction/guards, perception, context,
  planner round-trip, ticket preparation, dispatch, verification and totals. Popup
  live roundtrips include message transport; retained worker values exclude it.
  Machine total=plan+post-execution for same observation, excluding separately measured
  human confirmation. Timings never enter SafeAgentContext or provider content.
- Server exposes only numeric prehandler/planner timing header. Prehandler includes
  routing/parsing/validation; no fabricated one-way transport timing. Action unchanged.
- Automated Node/HTTP measurements remain separate from Chrome/NVIDIA latency.
  Phase 9 Chrome current-run timings, CPU/GPU/RAM and full pipeline all PENDING.
  Current browser inventory empty and no key configured; no manual pass or AI call.
  Phase 6B/7/8 manual statuses above unchanged. Phase 6A user evidence preserved.
- Tests: 21 metrics math/scoring/projection tests plus 2 extension integration/UI
  additions; 2 server timing-header tests. All prior regressions retained.
- Commands: npm run benchmark; npm run test:metrics; npm test; npm run check; server
  unittest command in README. Optional --ai only with privately configured key.

Limitations: tiny correlated clean-text dataset; field-signal PII scope; coarse mask
commands do not measure native pixel opacity; no calibrated confidence threshold;
OS caches not flushed between cold workers; no manual browser performance evidence.
Never sum Node OCR and HTTP benchmarks to manufacture end-to-end latency.

## Git checkpoint and exact next task

Baseline: 6b8172b, main clean and synchronized before implementation.
Latest checkpoint is the commit containing this document, subject:
feat: add SIH evaluation metrics. Resolve hash with git log -1 --format=%H; a commit
cannot include its own hash. Final report records actual normal push and
HEAD == origin/main / clean working tree verification. Only explicitly generated
fake fixture PNGs are included; no real captures, credentials, .env, dumps,
node_modules, venv or caches. Never force push.

Exact next task: **PHASE 10 - final SIH demo polish + submission/presentation evidence**.
NOT STARTED. Use real Phase 9 results and keep pending manual evidence explicit.
STOP after this Phase 9 commit/push.
