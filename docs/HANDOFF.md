# Session Handoff

## Phase 13H — preserve semantic controls in action fusion (2026-09-23)

**Live evidence (user):** `ACTION_FUSION buttons=1 controls=2 items=12 candidates=1 clickable=0
typeable=1`, then `/plan` 502 `INVALID_TARGET`.

**Traced root cause:** `controls=2` = the destination text input + the submit button (name /
employee-id inputs are sensitive and filtered; email/tel/password/select are not supported
controls). Grounding (`local-observation.js`) loops over OCR ITEMS and attaches each to a
control, so a control with no OCR item can never become a candidate. Full-screen OCR (PSM 11)
produced no item on the button (white text on the dark fill — the same failure mode the demo
CSS comment records for the old gradient). The existing crop-OCR refinement (auto-invert for
dark fills) could not help: `eligibleForRefine` only re-reads items that already matched.

**Fix (generic, pixel-only):** `recoverUnreadControls` in `perception/pipeline.js`. The DOM
decides which regions are clickable controls (visible, non-editable, not a sensitive field,
not overlapping a sensitive region); each one with no OCR item gets one crop-OCR read of its
own pixels via the existing `refineLocally`. A read that passes `visualTextIsSafe`, clears
`REFINE_MIN_CONFIDENCE` and survives the outbound guard becomes a normal pixel item with the
control's bbox, which the unchanged matcher then grounds (role/editable from DOM). Capped at
`RECOVER_MAX_CONTROLS = 3`. Unreadable/unsafe => still no candidate (fail closed).
Not done: using DOM label text for a control whose pixels read nothing — that would send DOM
text off-device, a privacy change you asked not to make. If the live log still shows
`recovered=0 clickable=0`, that is the decision point.

Unchanged: planner prompt, reasonCode, model, timeout, verifier, outcome, controller,
privacy/redaction, voice, execution validation (ticket still bound to observation, local
geometry, CLICK-compatible, re-validated at click time).

Tests: extension **393/393** (+7 `action-fusion.test.mjs`: recovery, no re-read when already
read, fail-closed reads, hidden/sensitive regions skipped, nearby text not attached, cap, and
the live shape through the real service worker for a button and a link — log
`candidates=2 clickable=1 typeable=1 recovered=1`, plan bound to the observation, ticket
executable). Mutations: disabling recovery fails 1; dropping the sensitive-overlap check fails 1.
Server 81/81 (unchanged). check, diff-check, secret scan PASS (292 files incl. new local dirs).

**Live PENDING (user):** reload the extension, reload the demo page, ANALYZE or RUN TASK; the
service-worker log must show `clickable>=1` (expect `... recovered=1`). Then the travel goal:
step 1 CLICK Continue -> step 2 STOP/GOAL_ACHIEVED -> result verification VERIFIED -> TASK COMPLETE.

## Phase 13G — planner terminal semantics refinement (2026-09-23)

Live `smoke-semantics` (user, real model): PASS form-ready-submit, generic-ready-send,
search-typed-no-results, navigate-pending; FAIL result-visible (STOP:STOP_NO_TARGET) and
no-target-unfinished (NOT_READY:INVALID_TARGET — the model invented a target; the server's
strict validation rejected it, as it should). The summary line wrongly read "2/6": it printed
the failure count.

- `server/app/ai_contract.py`: Decision policy rewritten as an explicit order — 1 RESULT
  visibly present -> STOP GOAL_ACHIEVED (even with no action available; generic examples:
  submission confirmation, requested search results, destination page loaded); 2 otherwise
  one action whose element's allowedActions lists it (NAVIGATE/SCROLL need none) ->
  ADVANCE_GOAL; 3 otherwise STOP NO_VALID_TARGET / INSUFFICIENT_CONTEXT, never invent a
  target. "The rules below refine step 2 only; they never override step 1" — likely cause of
  the result-visible miss: its goal mentions submitting a request, and the pre-existing
  form bullet ("STOP if a required field is missing") applied to a result page with no fields.
  No demo strings added to the generic policy (test-enforced).
- `scripts/smoke-semantics.mjs`: summary is `PASS|FAIL semantics: <passed>/<total>`.
- Server validation untouched (INVALID_TARGET stays strict). No model/timeout/controller/
  verifier/OCR/privacy/voice/grounding change.

Tests: server 81/81 (decision-order pin incl. ordering), extension 386/386 (+1: the live
4-pass/2-fail shape prints `FAIL semantics: 4/6`). check, diff-check, secret scan PASS.
**Live PENDING (user):** restart the AI server (prompt changed), run
`node scripts/smoke-semantics.mjs`, target `PASS semantics: 6/6`; no Chrome testing before that.

## Phase 13F — stable planner reason codes (2026-09-23)

**Live semantics run (user):** PASS form-ready-submit, result-visible; FAIL generic-ready-send,
search-typed-no-results, navigate-pending (all `INVALID_REASON`: the model paraphrased the
required exact sentence); FAIL no-target-unfinished (GOAL_ACHIEVED with nothing to act on).

**Change:**
- `server/app/ai_contract.py`: `ModelDecision.reasonCode` (Literal `ReasonCode`: ADVANCE_GOAL,
  GOAL_ACHIEVED, NO_VALID_TARGET, UNSAFE_TO_CONTINUE, INSUFFICIENT_CONTEXT) replaces the free
  `reason`. `REASON_MESSAGES` maps each code to one fixed message; `SafeReason` is now that
  outbound message set (drift-guarded by the extension). NO_VALID_TARGET and
  UNSAFE_TO_CONTINUE reuse the old wording. Prompt policy rewritten per code: GOAL_ACHIEVED
  only with the result visibly present; never for filled fields, typed text, ready state,
  no candidate or uncertainty; advancing action => ADVANCE_GOAL; no valid action =>
  NO_VALID_TARGET / INSUFFICIENT_CONTEXT; unsafe => UNSAFE_TO_CONTINUE. The prompt contains
  no reason sentences at all now.
- `server/app/ai_planner.py`: builds `PlanResponse.reason` from the code (model text never
  forwarded; a free-text `reason` key is rejected as an extra property). Non-STOP => ADVANCE_GOAL
  message. GOAL_ACHIEVED with zero visual elements => INSUFFICIENT_CONTEXT (no visible evidence).
  INVALID_REASON now means an invalid `reasonCode`.
- `extension/src/shared/outcome-contract.js`: classifies the two new messages
  (INSUFFICIENT_CONTEXT => STOP_INCOMPLETE_CONTEXT; ADVANCE_GOAL on a STOP => STOP_NO_PROGRESS).
  Old messages stay classified (non-success). Controller, verifier, grounding untouched.
- `scripts/smoke-semantics.mjs`: scenario 6 now shows visible non-result text with no
  candidate, so it tests the model; the empty-page case is refused server-side and unit-tested.

**Tests:** server **81/81**, extension **385/385**; all six scenarios' contexts plus correct
reasonCode answers pass the real server validation (mac venv). check / diff-check / secret
scan (199 files, venv excluded) PASS. **`node scripts/smoke-semantics.mjs` was NOT run here — no
NVIDIA key on this machine.** Restart the AI server and run it; acceptance is
`PASS semantics: 6/6`. Do not start live Chrome testing until it is 6/6.

## Phase 13E — ready state vs achieved goal (2026-09-23)

**Live bug:** travel goal, step 1 planner STOP with `The goal is already achieved.`; 13C
correctly returned VERIFICATION_INCONCLUSIVE (no action taken). The planner treated
"all required fields filled" as "goal achieved" — the goal is "check ... AND submit it".

**Could not inspect the live observation from here** (no key/Chrome on this machine). Two
causes fit: (H1) Continue was CLICK-capable and the model misjudged success, or (H2) Continue
was not a CLICK-capable candidate in that observation (e.g. off-screen), so the model could
not click and misused the success reason. Evidence for H2: before 13D the model clicked
"Bengaluru" despite the existing "MUST CLICK Continue" rule. The prompt fix is correct under
both; if the next live run ends with a non-success STOP instead of CLICK Continue, check the
service-worker line `ACTION_FUSION ... clickable=N` (0 => Continue not grounded; scroll it
into view) or the manual ANALYZE agent-context preview (`actionCandidates`).

**Change (prompt only, generic):** `server/app/ai_contract.py` Decision policy gains:
READY is not ACHIEVED; prerequisites are not results; action goals (submit, send, open,
search, navigate, click, type, continue) are achieved only when the RESULT is visible now;
check-AND-act goals only after the act; if exactly one element's allowedActions clearly
advances an unfinished goal, choose it; success STOP needs visible evidence. No verifier,
outcome contract, grounding, privacy, OCR, controller, timeout, model or voice change.

**Tests:** server **80/80** (+1 policy pin, asserts no page/demo tokens in the new policy).
Extension **383/383** (+4, `smoke-semantics.test.mjs`). New live check
`scripts/smoke-semantics.mjs` (6 scenarios: form ready -> CLICK submit; generic ready -> CLICK
Send; result visible -> GOAL_ACHIEVED; search typed, no results -> not achieved; navigation
pending -> not achieved; no target -> non-success STOP); every scenario context was validated
through the real server schema/projection/target checks. A fake provider cannot prove model
behaviour — only the live run does.

**Live acceptance: PENDING (user)** — restart the AI server, then
`node scripts/smoke-semantics.mjs` (expect `PASS semantics: 6/6`) and the travel RUN TASK
(expect step 1 CLICK Continue ... TASK COMPLETE). See docs/TESTING.md "Phase 13E".

## Phase 13D — action grounding + voice reliability (2026-09-23)

### A. Target accuracy — root cause (inspected, not guessed)
Live run: step 1 `CLICK Bengaluru`, then a planner STOP that was NOT VERIFIED (13C correctly
withheld TASK COMPLETE). On `demo-page/index.html` the destination is
`<input type="text" value="Bengaluru">`. `observe.js` marks it editable (role `input`); OCR
reads the VALUE inside that input's box, so the value grounds as a candidate with
`role=input, editable=true` — correct as a TYPE target. But nothing stopped CLICK on it:
- server `ai_planner.py` accepted CLICK on any `actionable_ids` member;
- client `validateAction` accepted CLICK on any candidate;
- the model saw only `actionable=true` for both the value and Continue.
So it was contract/metadata (B), not over-permissive candidate generation (A): checkbox,
radio, select, email/tel/password inputs and plain text are already NOT candidates.

**Fix (general; no text, id or demo-specific rule):** editable => TYPE-only.
- `server/app/ai_input.py`: model input gains per-element `allowedActions`, derived from the
  existing role/editable/focused metadata (wire schema unchanged); `PreparedPlan.clickable_ids`
  = actionable AND not editable.
- `server/app/ai_planner.py`: CLICK outside `clickable_ids` => 502 `INVALID_TARGET`.
- `server/app/ai_contract.py`: prompt uses allowedActions; never CLICK page text or a
  field's value; prefer the element whose role/text directly performs the next step.
- `extension/src/shared/action-contract.js`: CLICK on an editable candidate rejected.
- `extension/src/background/local-observation.js`: `ACTION_FUSION` adds `clickable=`/`typeable=`
  counts (numbers only).
Not done (not needed for this bug): exposing DOM labels (e.g. "Destination") to the planner
would send page text off-device, a privacy change; checkbox/radio/select are still not
candidates. If the model still picks the value, the run now fails as PLANNER_UNAVAILABLE
(invalid target) instead of clicking it — no retry, by design.

### B. Voice — failure category
Phase 12 assumed getUserMedia prompts from the popup. Chrome cannot show permission prompts
in an extension popup: the call is rejected unasked (NotAllowedError), which the popup showed
as "permission denied" — indistinguishable from a real block or a speech `network` error.
Now: `navigator.permissions` state `prompt` => MIC_PERMISSION_REQUIRED (+ GRANT MICROPHONE
ACCESS button opening `src/popup/mic-permission.html`, an extension-owned tab that can prompt;
the grant covers the popup); `denied` => MIC_PERMISSION_DENIED; recognition errors map to
SPEECH_NETWORK_ERROR / SPEECH_NO_RESULT / MIC_NOT_FOUND / SPEECH_ERROR; a recognition that ends
silently now reports SPEECH_NO_RESULT instead of "Listening…" forever. Status never contains the
transcript; nothing is logged. **Privacy wording corrected:** webkitSpeechRecognition sends
audio to Google's speech service; voice is not on-device (popup comment, AI_CONTEXT, the
Listening status and the grant page all say so). No cloud API or key added.

Tests: extension **379/379** (+10: `action-grounding.test.mjs` 5, voice 5; voice pins updated
for codes; ACTION_FUSION format pin extended). Server **79/79** (+1 editable-target test; two
projection pins now include allowedActions) — run locally with the untracked
`server/.venv-mac` (Python 3.12, fastapi 0.141.1), which was not modified. Mutations: removing
the client guard fails 3; server guard fails 1; projecting editable as CLICK fails 4.
npm run check, git diff --check, scan:secrets (197 files, venv excluded for the run) PASS.
Phases 13A/13B/13C code untouched.

**Live acceptance: PENDING (user)** — no NVIDIA key on this machine. See docs/TESTING.md
"Phase 13D".

## Phase 13C — autonomous result verification (2026-09-23)

**Gap closed:** TASK COMPLETE meant only "the planner says the goal is achieved".
- BEFORE: TASK COMPLETE = planner-declared success.
- AFTER: TASK COMPLETE = planner-declared success **and** local result verification
  of the current fresh post-action observation. Either one alone => not COMPLETED.

**Existing Phase 8 verifier, inspected:** `verifyAfterClick` (manual CLICK only) waits
750 ms, takes ONE new local observation, then `verifyVisualResult(agentContext,
{actionObservationId, dispatchedAt})` returns `{status: VERIFIED|NOT_VERIFIED, reason?,
evidence?}`. Gates: builder-approved frozen context (`prepareAgentContextForTransport`),
new observation id, capture after dispatch. Logs nothing page-derived. **Its evidence rule
is hard-wired to "Travel Request Submitted"** (any other spec => INVALID_SPEC).

**Decision:** reuse the gates and result contract, not the travel phrase (no travel-specific
success check allowed). `verify-visual-result.js` now factors the two gates out and adds
`verifyStateChange(context, lastAction)` plus `stateSignature(context)` (moved from the
service worker, where it remains the loop-detection signal). Evidence rule: the fresh safe
state fingerprint must differ from the one the last executed action saw. Reasons:
NO_ACTION_TAKEN, STALE_OBSERVATION, PRIVACY_FAILED, NO_STATE_CHANGE, INVALID_SPEC.
**Limit (honest):** this shows the action visibly changed the page; it is not semantic proof
that the goal was met, and not universal verification.

**Wiring:**
- `agent-controller.js` (orchestration only): records `lastAction = {actionObservationId,
  dispatchedAt, beforeSignature}` after each EXECUTED action. On a STOP that
  `classifyStop` calls success, emits VERIFICATION_STARTED, calls injected
  `verifyResult(op, lastAction)` with the CURRENT op, emits VERIFICATION_RESULT
  `{status, reason, detail, ms}`, re-checks cancellation, then COMPLETED only if verified.
  Missing/throwing verifier => VERIFIER_UNAVAILABLE. Non-success STOPs, planner and
  privacy failures never reach the verifier.
- `outcome-contract.js`: `VERIFY_CODE` + `verifiedOutcome()` (fail-closed; only
  `status === 'VERIFIED'` is success).
- `service-worker.js`: `verifyResult` = `verifyStateChange(op.context, lastAction)` on the
  same approved context the planner received (no extra capture); safe log adds
  `detail=`/`ms=` (fixed codes and numbers only).
- `popup.js`: fixed texts for the three codes; one agent-log line
  "Step N: result verification VERIFIED / NOT VERIFIED". No layout change. Phase 13B
  snapshot/rehydration untouched (it already carries the terminal code).

**Tests: 369/369 PASS** (was 353; +16 in `extension/tests/agent-verification.test.mjs`).
Eight existing tests asserted planner-only completion; they now inject a verifier stub or use
fixtures whose page visibly changes after the last action (`agent-controller`,
`browser-actions`, `agent-integration`, `agent-state`, `browser-actions-integration`).
Mutations (applied, observed, reverted): bypass verification fails 10; failure treated as
COMPLETED fails 6; verify pre-action observation fails 6; verify every STOP fails 15;
verifier skips freshness fails 1; verifier skips change check fails 2.
npm run check PASS, git diff --check PASS, scan:secrets PASS (194 files; untracked
`server/.venv-mac/` excluded for the run). Server untouched; server tests not run.

**Live acceptance: PENDING (user)** — needs Chrome + AI mode (deterministic mode never
claims GOAL_ACHIEVED). Steps in docs/TESTING.md "Phase 13C".

## Phase 13B — popup run-state rehydration (2026-09-23)

**Bug fixed: reopened popup looked idle during a live run.** The autonomous run lives in
the service worker, but the popup only learned about it from the `RUN_TASK` response and
live `AGENT_UPDATE` broadcasts. Closing the popup dropped both, so a reopened popup showed
Idle, hid STOP TASK and re-enabled RUN TASK while automation was still acting.

**Change (one run-state record, popup is a view):**
- `agent-controller.js` — `initialAgentSnapshot()` + pure `reduceAgentSnapshot()`, derived
  only from the events `runAgent` already emits. Whitelisted fields only:
  `{ active, runId, state, step, maxSteps, lastAction, outcomeCode }`. `lastAction` must be
  an `ACTION_FIELDS` key; `outcomeCode` must match `^[A-Z_]{1,64}$`. Events for another
  run, or after the run ended, are ignored. No target/OCR/page text, plan reason, URL,
  goal or exception body can enter it.
- `service-worker.js` — the old `agentActive` boolean is replaced by `agentRun` (the
  snapshot), reduced in the existing `agentEmit`. All concurrency guards now read
  `agentRun?.active`. New `GET_AGENT_STATE` returns a copy (or `{active:false,state:'IDLE'}`).
  `CANCEL_TASK` accepts an optional `runId`; a mismatching one is rejected (`STALE_RUN`)
  and does not cancel the current run. A controller throw closes the record as FAILED.
- `messages.js` — `GET_AGENT_STATE` added to the existing `MSG` contract.
- `popup.js` — on open, queries `GET_AGENT_STATE` (read-only: never starts or cancels).
  Active => card shown, RUNNING, `step / maxSteps`, last action, STOP TASK shown, RUN and
  ANALYZE disabled. Terminal => Phase 13A labels via the existing `renderAgentEvent`.
  STOP TASK sends the tracked `runId`; `AGENT_UPDATE`s for any other run are ignored.
  Terminal events now release the controls (a reopened popup has no pending RUN_TASK).

**MV3 limitation (documented, not solved).** State is in worker memory only; no
`chrome.storage` (the network/retention test forbids it). During a run the worker makes
continuous extension-API calls and a localhost fetch, which keep it alive in practice. If
Chrome tears the worker down anyway, the run dies with it, and a reopened popup truthfully
shows Idle — not the lost run's outcome. After a run ends and the popup is closed, the
worker idles out (~30 s) and the retained terminal state is lost with it; reopening
within that window shows the final state, later shows Idle.

**Tests: 353/353 PASS** (was 343; +10 in `extension/tests/agent-state.test.mjs`: reducer
x3, real service worker reopen/cancel-same-run/no-duplicate/stale-cancel/no-PII x1, popup
x6). `verification-popup.test.mjs` now expects the read-only `GET_AGENT_STATE` on open.
Mutation-verified: popup not querying state fails 5; popup ignoring runId fails 1; worker
ignoring cancel runId fails 1; reducer leaking target text fails 2; terminal event not
releasing controls fails 1. npm run check PASS, git diff --check PASS, scan:secrets PASS
(193 files; untracked local `server/.venv-mac/` excluded for the run — its only hit is an
SPDX license id in pip, a false positive). Server untouched; server tests not run.

**Live acceptance: PENDING (user)** — see docs/TESTING.md "Phase 13B". Popup
close/reopen needs a human on the extension action icon.

## Phase 13A — autonomous STOP / completion semantics (2026-09-23)

**Bug fixed: false task completion.** `agent-controller.js` returned
`AGENT_STATE.COMPLETED` for *every* planner STOP, and the popup rendered that as
**TASK COMPLETE**. Two of the four AI reasons and all three deterministic STOP
reasons mean the agent could NOT proceed, so a run that clicked nothing — because
no target existed, or because continuing was unsafe — reported success to the user.

**Root cause was the contract, not the controller.** `ai_contract.py` instructed the
model to "STOP ... if the observed goal is already achieved" but gave it no reason
string that could say so. On a real success the model had to pick one of the four
existing reasons, and the natural pick after submission is "No suitable visual target
is available." (the Continue button is gone) — byte-identical to a genuine failure.
STOP therefore carried success and failure simultaneously, and no pure mapping could
separate them.

**Change:**
- `server/app/ai_contract.py` — added `GOAL_ACHIEVED_REASON = "The goal is already
  achieved."` to the canonical `SafeReason` enum (now five values) plus prompt text
  stating it is the only reason that reports success and must not be used for any
  other STOP cause. No new enum; no model, schema or action change.
- `extension/src/shared/outcome-contract.js` (new) — the single reason -> outcome
  mapping covering every reason both planner modes can emit. `classifyStop()` is
  fail-closed (unknown, absent, non-string, or prototype-chain key => non-success)
  and uses `Object.hasOwn` so `"constructor"` cannot resolve to an inherited value.
- `extension/src/background/agent-controller.js` — STOP now classifies:
  success => `COMPLETED`, everything else => `STOPPED`. Reason codes replace the old
  single `PLANNER_STOP`. All other controller behaviour is untouched.
- `extension/src/popup/popup.js` — TASK COMPLETE / TASK STOPPED / TASK FAILED /
  TASK CANCELLED (previously CANCELLED rendered as "STOPPED" and FAILED as "FAILED"),
  with fixed per-code explanatory text. No server- or page-derived string is rendered.

**Deterministic mode cannot report success.** It has no way to observe that the goal
was reached, so all three of its STOP reasons classify as non-success and a
deterministic run never shows TASK COMPLETE. Adding submission detection would be
hardcoded travel logic and duplicate Phase 8 verification; both were out of scope.
Demonstrating the success path requires AI mode.

**Tests: 343/343 PASS** (was 303; +40). New: `extension/tests/outcome-contract.test.mjs`
(7 — unit + drift guards that read the real server files) and
`extension/tests/agent-outcome-popup.test.mjs` (17 — every terminal state's label).
`agent-controller.test.mjs` gained 15 (success, each non-success reason, fail-closed
cases, CLICK->re-observe success and non-success shapes). Four existing fixtures that
encoded the bug now carry an explicit reason.

**Mutation-verified** (each mutation applied, observed, reverted): reintroducing the
original bug fails 14 tests; mislabelling the popup fails 9; adding an unclassified
server SafeReason fails the drift guard; drifting the JS constant fails 2.

Checks: npm test 343/343, npm run check PASS, git diff --check PASS,
npm run scan:secrets PASS (191 files).

**Server tests NOT RUN — environment blocker.** This machine has Python 3.9.6 only and
`fastapi==0.141.1` requires >= 3.10; `server/.venv` is a Windows venv. The Python edits
were verified by `py_compile` and by AST-extracting `SafeReason` (5 values, success
value present) and cross-checking the constant against the JS one. Run
`python -m unittest discover -s tests -v` under the Windows 3.10 venv to confirm the
53 server tests still pass with the extended enum.

**Live acceptance remaining (user — needs Chrome + AI mode):**
1. Success: `PLANNER_MODE=ai` + `NVIDIA_API_KEY`, open demo-page/index.html with all
   seven fields filled, RUN TASK with the default goal. Expect CLICK Continue ->
   re-observe -> STOP "The goal is already achieved." -> **TASK COMPLETE**.
2. Non-success: clear one required field (e.g. Purpose) and RUN TASK. Expect STOP with
   a non-success reason -> **TASK STOPPED**, never TASK COMPLETE.
3. Deterministic mode: any run ends TASK STOPPED, never TASK COMPLETE (expected).

**Known issues NOT addressed here (later phases):** popup run-state rehydration;
Phase 8 verification is still not wired into autonomous mode, so COMPLETED reflects the
planner's judgement rather than verified pixels; voice cloud-transcription claim;
benchmark/dashboard schema mismatch; missing-measurement handling; dashboard UI bugs.

## Phase 12 HOTFIX — goal input typing + microphone permission (2026-09-12)

Fixes two live bugs reported after the initial Phase 12 commit (b553ba1):

1. **Could not type in the goal input (Priority 1, root-caused).** A CSS cascade bug:
   `.mic { width:auto }` and `.btn { width:100% }` had equal specificity, and `.btn`
   appeared later, so the mic button inherited `width:100%` with `flex:0 0 auto`
   (no shrink) — collapsing the `flex:1` goal input to ~0 width. Typing was impossible
   because the input was visually collapsed, not disabled. Fixed with higher-specificity
   `.goal-row .mic { width:auto; flex:0 0 auto }` and `.goal-row .goal { flex:1 1 auto;
   min-width:0 }`, which beat `.btn` regardless of source order. The goal input is a plain
   text field and is NEVER disabled by voice state.

2. **Microphone failed with no permission prompt (Priority 2).** SpeechRecognition alone
   often won't prompt for the mic in an extension popup. The mic handler now calls
   `navigator.mediaDevices.getUserMedia({ audio: true })` first (then immediately stops the
   returned tracks — we don't capture audio; SpeechRecognition opens its own stream), and
   only then starts recognition. Denied/no-device/unsupported and recognition `not-allowed`
   all map to safe fallback messages; the goal input stays editable and no run starts. The
   entire voice block is wrapped in try/catch so a voice-setup failure can never break text
   input or the rest of the popup. No manifest permission was needed (getUserMedia prompts
   from the extension page's secure context); no broad host permission added.

Voice remains speech-to-text ONLY: transcript fills the SAME goal input, user reviews it,
existing RUN TASK path is unchanged. No audio stored/sent; no new dependency/API/key; no
server change.

Files: extension/src/popup/{popup.js,popup.css}; test extension/tests/voice-popup.test.mjs
(now 11 tests). Checks: npm test 303/303, npm run check PASS, git diff --check PASS,
npm run scan:secrets PASS.

Live check remaining (user, cannot be automated here — unpacked-extension load needs a
native dialog): reload at chrome://extensions, reopen popup, (a) click the goal box and
type — MUST work now; (b) clear it, press mic — Chrome should prompt for the microphone;
allow it, say "Open YouTube and search for calculus videos"; confirm the transcript appears
in the goal input with NO browser action, then RUN TASK hands off to the existing agent.
Known Chrome limitation: even with mic granted, Web-Speech in an MV3 popup can still return
a `network` error on some Chrome builds — the fallback messaging handles this and text mode
always works; if it recurs, report the exact recognition `error` code.

## Earlier: Phase 12 — unified voice + text goal input (b553ba1)

Added the mic button beside the goal input using browser-native SpeechRecognition /
webkitSpeechRecognition (popup-only), feeding the SAME goal path. See the hotfix above for
the corrected behavior. Only the final goal string enters the existing pipeline.

Next phase (not started): final evaluation metrics + demo polish + submission cleanup.

## Earlier: Phase 11C (complete, live-verified)

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
