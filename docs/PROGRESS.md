# EdgeSight progress

**Phases 0-9 complete in code. Phase 9 manual Chrome metrics PENDING.**
Checkpoint 2026-09-11. Phase 9 controlled evaluation implemented.

Phase 6A remains user Chrome-verified: POST /plan -> FastAPI 200, seven fields, five
sensitive fields/redacted regions, privacy safe/rawPiiIncluded=false, five role
placeholders, Bengaluru/Conference retained and working deterministic planner.
Unreported detailed checks are not inferred.

Phase 6B retains the single NVIDIA NIM adapter, minimized guarded structured context,
strict output validation and explicit ai mode with no fallback. Its integrated NVIDIA
server/Chrome run is PENDING; no NVIDIA_API_KEY configured in this shell, no provider call.

Phase 7 executes one user-triggered visually grounded click using a local single-use
observation/tab/document ticket. Positive and stale/wrong-page Chrome demos remain PENDING.

Phase 8 automatically waits 750 ms after successful dispatch, captures the same intended
active tab again, creates a new observation, reruns local OCR/privacy/redaction/filtering,
and checks only approved pixel OCR for 'Travel Request Submitted'. New URL/document is
allowed; old pixels/context never prove success. One attempt, 60s total bound, 45s OCR,
5s API bounds. No /plan, NVIDIA or remote calls, no replan or second click. Exact matching,
bbox reading order, actual confidence and timing policy are in AI_CONTEXT.md.
Popup result: Waiting -> VERIFYING -> VISUALLY VERIFIED / NOT VERIFIED + Analyze again,
expected evidence, distinct before/after observation IDs and actual privacy status.

Phase 8 positive and negative manual demos remain PENDING: Chrome was launched but
Computer Use stopped because it could not reliably determine the browser URL to enforce
policy. No extension reload/click/verification was observed, no manual pass claimed.

Automated results: **230/230 extension entries** (23 new Phase 9 + all 207 prior),
**52/52 server methods**, syntax/manifest/packaged OCR integrity and diff check PASS.
Genuine cold/warm Node/WASM synthetic OCR smoke PASS; real local FastAPI smoke confirms
deterministic 200/CLICK and ai missing-key 503 with correct headers, no provider call.
Tests prove fresh capture/OCR/identity, document replacement, privacy canaries absent
from output/popup/logs, zero verification fetch, bounded errors/no retries, phrase-only
matching and popup progress/reopening. They are not a real Chrome acceptance run.

Limits: one capture may miss slow transitions, OCR/unknown-PII errors, English text-only
phrase policy, no backend-persistence proof, non-atomic tab/capture checks, cross-origin
permission failures, transient state lost on worker restart. Existing model limitations
remain. No new side effects/provider/Pi or general automation.

Phase 9: versioned controlled fixtures/JSON, real pixel-OCR benchmark, actual PII
classifier and redaction-command evaluation, actual asset/payload bytes, cold/warm
Node OCR and deterministic HTTP timings, current-run popup timing hooks. Quality:
41/41 expected text items (5 synthetic screens); PII TP 15/FP 6/FN 5/TN 14 (40 candidates),
precision 71.43%, recall 75%, F1 73.17%; redaction precision 72.09%, recall 75.61%,
safe preservation70.73% (3 layouts). Failures retained. Full values and limitations
in METRICS.md/reference JSON. No general accuracy, native pixel coverage or CPU claim.

Phase 9 Chrome live timings PENDING. Current browser inventory empty; no configured
NVIDIA key or provider request. Benchmark timings are Node/Python/loopback only;
Chrome plan/verification/machine totals are unmeasured. Human delay kept separate.

Exact next implementation task: **PHASE 10 - final SIH demo polish + submission and
presentation evidence**. NOT STARTED. Stop after Phase 9 commit/push.
