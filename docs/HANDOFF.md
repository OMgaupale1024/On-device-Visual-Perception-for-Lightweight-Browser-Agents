# Session Handoff

## Current task and baseline

Phase 11C — safe browser action vocabulary (CLICK/TYPE/PRESS_KEY/SCROLL/NAVIGATE/STOP)
plus a planner-latency diagnostic and fix — is **complete and live-verified**. Baseline
for this work was 68af028 on main; the diagnostic/fix work above it is uncommitted as of
this handoff (see Uncommitted Files below — commit before starting new work).

## What Phase 11C added (unchanged from prior handoff, still accurate)

- One server action contract (schemas.ActionPayload) reused by model parsing and HTTP.
  One extension validator reused by transport and ticket creation. Irrelevant fields
  are rejected; the four existing reason phrases stay.
- TYPE: current approved editable visual candidate; exact substring of the guarded
  goal, at most 500 characters, no control characters or obvious PII. Reclassifies
  sensitivity before execution; rejects password/sensitive/readonly/replaced/moved/
  covered controls. Native value setter and input events; rechecks after focus and
  beforeinput handlers. No private-value typing.
- PRESS_KEY: ENTER only, bound to current approved editable focus. Fixed keyboard
  events; uncancelled ENTER on a form uses native requestSubmit().
- SCROLL: UP/DOWN, SMALL/MEDIUM/LARGE, bounded distances computed locally.
- NAVIGATE: normalized absolute HTTP/S, no credentials/unsupported schemes. Rechecks
  active tab, document and TTL before updating the same tab. Bounded tab-load event
  wait; cancellation/timeout removes listeners. Tickets remain single-use.
- Same controller, eight steps maximum. Fresh observe/plan after every action;
  duplicate guard includes action parameters. Optional popup ENABLE BROWSING ACROSS
  SITES grants <all_urls> for cross-origin navigation captures.
- Controlled local fixture: demo/search.html (+ CSS/JS), no hardcoded planner steps.

## Planner-latency diagnostic and fix (this session)

Live smoke (`node scripts/smoke-planner.mjs --ai`) returned real CLICK success but a
real STOP-stage `504 PROVIDER_TIMEOUT` at the 30s deadline, reproduced twice
(elapsedMs 30019, 30087) — CLICK completed in 5.7s/3.5s on the same runs, and STOP's
input was *smaller* than CLICK's, ruling out prompt/context size. The
`X-EdgeSight-Planner-Failure`/`X-EdgeSight-Planner-Upstream-Status` diagnostics added
earlier this phase isolated the category to `PROVIDER_TIMEOUT` before any code changed
(per-command evidence trail, not speculation).

Root cause: `max_tokens: 256` on a `response_format: json_object` request let the model
spend its output budget on a long freeform `reason` for the ambiguous "empty page" STOP
case instead of the short fixed-string reason the contract requires, exceeding the 30s
deadline at the observed token rate.

Fix (`server/app/nvidia_provider.py`): `max_tokens` lowered 256 -> 96 (a valid one-action
decision is ~20-80 tokens). Nothing else in the request changed: temperature=0,
`response_format: json_object`, `chat_template_kwargs: {enable_thinking:false}` all
unchanged. No timeout increase, no model change, no fallback, no schema/prompt weakening.

**Live re-verification (user, real NVIDIA, after the fix): CLICK and STOP both READY,
planner latency ~1.34s CLICK / ~0.98s STOP.** Travel RUN TASK regression and the
controlled multi-action NAVIGATE/TYPE/ENTER/SCROLL/STOP workflow both user-confirmed PASS.

Diagnostic tooling kept (not just throwaway): `requestPlan`/`smoke-planner.mjs` surface
`plannerMs` (from server `Server-Timing`, isolates real provider latency from localhost
overhead); `--repeat N` runs the CLICK/STOP pair N times with a min/median/max summary,
for future latency regression checks without writing new scripts.

## Automated checks (current working tree, all green)

- server/.venv/Scripts/python.exe -m unittest discover -s tests: **78/78 PASS**
  (76 prior Phase 11C + 2 diagnostic tests: rejected-output fixed-diagnostic-without-
  model-text, PlannerFailure failure_code allowlist).
- npm test (root): **292/292 PASS** (284 prior + 8 in new `extension/tests/smoke-planner.test.mjs`:
  allowlisted-vs-private failure codes, STOP 504 naming without reading the error body,
  upstream-status passthrough without leaking headers/bodies, repeat-mode summary stats,
  wrong-decision handling, health-timeout/unreachable-server handling, real CLI subprocess
  exit-code check).
- npm run check: PASS. git diff --check: PASS. npm run scan:secrets: PASS (no credential
  patterns).

## Live acceptance status

1. `node scripts/smoke-planner.mjs --ai` — **PASS** (post-fix: CLICK ~1.34s, STOP ~0.98s).
2. Travel RUN TASK regression (CLICK Continue -> fresh observation -> STOP; privacy 5/5,
   rawPiiIncluded=false; manual mode) — **PASS**, user-confirmed.
3. Controlled multi-action workflow (demo/search.html: NAVIGATE -> TYPE -> ENTER ->
   SCROLL -> STOP, model-selected, fresh observations, privacy SAFE) — **PASS**, user-confirmed.
4. Uncontrolled "Open YouTube and search for calculus videos" — **not yet attempted**;
   optional stretch check, not required for Phase 11C acceptance.

Phase 11C is live-verified end to end (items 1-3). Full evidence recorded in
docs/TESTING.md ("Phase 11C planner-latency diagnostic and fix").

## Uncommitted Files / Constraints

All Phase 11C-diagnostic work is still uncommitted in this working tree:
- extension/src/transport/planner-client.js (httpStatus/upstreamStatus/failureCode/plannerMs surfaced)
- scripts/smoke-planner.mjs (fixed diagnostic codes, --repeat N, summary stats)
- extension/tests/smoke-planner.test.mjs (new, 8 tests)
- server/app/{ai_planner,main,nvidia_provider}.py (failure_code allowlist, max_tokens fix,
  X-EdgeSight-Planner-Failure header)
- server/tests/{test_actions,test_ai_planner}.py (new/updated diagnostic tests, max_tokens=96 assertion)
- docs/{TESTING,HANDOFF}.md (this evidence)

Next step: commit and push this evidence as a stable checkpoint (suggested message:
`chore: add safe planner diagnostics and live acceptance evidence`), verify
HEAD == origin/main and a clean tree, then stop — Phase 11C is done.

Do not reset work, redesign the loop, add retries/fallback, change the NVIDIA model
further, hardcode site steps/visual IDs, weaken privacy/target validation, or accept
model JS/selectors/coordinates. No voice, TYPE_LOCAL_REF, vault, TEE or desktop launcher.
The next phase (not started) is whatever the user assigns after this checkpoint.
