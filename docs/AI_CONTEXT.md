# EdgeSight — AI Context

FIRST READ this file and docs/HANDOFF.md, then git status and git log --oneline -10.
Code, tests and Git outrank documentation. Preserve uncommitted work.
Do not read docs/archive/ by default.

## Project and current state

EdgeSight — SIH26171, ISRO, Smart India Hackathon 2026. Browser-local visual perception
and privacy filtering produce a minimal safe state for a cloud next-action planner.

**Phase 11B is LIVE VERIFIED by the user at baseline 7a8f5d0:** one RUN TASK drives
real NVIDIA CLICK → local execution → fresh observation → NVIDIA STOP, privacy SAFE;
manual mode works. Timeout, API key, network, OCR and grounding are not current blockers.

**Phase 11C is LIVE VERIFIED by the user:** real NVIDIA CLICK/STOP smoke, the travel
RUN TASK regression, and a controlled multi-action NAVIGATE/TYPE/ENTER/SCROLL/STOP
workflow all pass. Vocabulary: CLICK, TYPE, PRESS_KEY, SCROLL, NAVIGATE, STOP.
A STOP-stage NVIDIA `504` timeout found during live smoke was root-caused to an
oversized `max_tokens` (256, lowered to 96) letting the model ramble past the 30s
deadline on ambiguous STOP decisions — fixed; live latency is now ~1s-class per call.
See docs/TESTING.md ("Phase 11C planner-latency diagnostic and fix") for evidence.

## Architecture

User goal → existing service-worker/controller → fresh browser observation → local
OCR + DOM semantics → local PII detection/redaction/guard → frozen SafeAgentContext →
localhost FastAPI → real NVIDIA Nemotron chooses ONE action → server validates →
client validates → local single-use ticket → execute → settle → fresh observe/plan.
STOP, cancellation, step limit, repeated actions or unsafe/unavailable stages terminate
the loop. Manual Analyze/Plan/Execute remains available.

- agent-controller.js: one orchestration-only loop, MAX_STEPS=8, settle=750ms,
  duplicate limit=2 (safe-state signature plus action parameters), no fallback/retry.
- Runs stay on their starting tab/window. Tickets bind observation, document, tab,
  URL and 60-second TTL. Each execution attempt consumes its ticket. NAVIGATE waits
  for tab completion with a bounded event listener, then re-observes anew.
- Fusion remains OCR centre inside a control OR >=50% OCR containment, through
  existing mapRect scaling. Candidates remain observation-scoped string IDs. Added
  local associations supply only role/editable/focused flags on safe visual items.
  Ambiguous associations and detected sensitive controls grant no new authority.
- Server ActionPayload is reused by NVIDIA parsing and HTTP PlanResponse. Extension
  shared/action-contract.js is reused by response and ticket validation. Irrelevant
  action fields are rejected; no alternative action system exists.

## Actions and safety

| Action | Parameters and local policy |
|---|---|
| CLICK | Current approved visual target; existing button checks retained; safe links/editable controls supported |
| TYPE | Current approved non-sensitive editable input/searchbox/textarea; exact guarded-goal substring, <=500 characters, no obvious PII/control characters |
| PRESS_KEY | ENTER only; current focused approved editable control; fixed events and uncancelled native form submission |
| SCROLL | UP/DOWN; SMALL/MEDIUM/LARGE; bounded distance computed locally |
| NAVIGATE | Normalized absolute HTTP/S; no credentials/unsupported schemes; old document checked before same-tab update |
| STOP | No action; null target retained on the wire for compatibility. Terminal outcome is classified from the reason (Phase 13A): only `The goal is already achieved.` completes the run |

TYPE reclassifies field sensitivity before acting and rechecks structure after focus/
beforeinput handlers. Local DOM identities never leave the browser. No model-supplied
JS, eval, CSS selectors, XPath, coordinates, shell commands or key sequences.
Nemotron remains the decision-maker; the server never substitutes actions.

The strict reason enum now has **five** phrases (Phase 13A added one). The added
value `The goal is already achieved.` is the ONLY reason that reports success, and
it is what makes a STOP mean completion rather than a stall. `server/app/
ai_contract.py` exports it as `GOAL_ACHIEVED_REASON`; the browser mirrors it in
`extension/src/shared/outcome-contract.js`, and a drift guard test fails if the two
diverge or if any server reason loses its classification. Reasons remain a fixed,
non-sensitive vocabulary validated server-side; no free model text is displayed.

Cross-origin tasks require optional ENABLE BROWSING ACROSS SITES in the popup
(<all_urls> for Chrome capture). NAVIGATE fails closed without it. Manual activeTab
use remains available. No new CSP network destination was added.

## Privacy and provider invariants

- Raw screenshots/OCR, raw DOM, field values, local control identities and secret
  lists never cross the wire. Existing detection/redaction engines are unchanged.
- Only the exact frozen builder-approved context reaches transport; final local
  known-value checks run before approval. Sensitive fields remain placeholders.
- Provider input: goal, optional guarded origin (no path/query/fragment), privacy flags,
  semantic roles/filled/safe values, visual IDs/text/confidence/actionability/role/
  editable/focused, redaction legend. No image, bbox, observation ID or DOM identity.
- NVIDIA is an LLM over sanitized structured state, not a VLM. AI mode is explicit;
  deterministic mode exists for offline use, never as fallback in AI mode.
- NVIDIA_API_KEY stays server-only: never in chat/logs/source/browser/prompts.
  No .env auto-loader. NVIDIA_TIMEOUT_SECONDS remains finite 1–120, default 30;
  browser deadline remains 35s. No model/timeout/provider-request behavior changes.
- Logs contain fixed action/status/reason codes and counts/IDs only. No TYPE text,
  URL, OCR text, screenshot, prompt, response body or API key in logs.

## Files and commands

- extension/src/background/{agent-controller,service-worker,local-observation}.js
- extension/src/content/observe.js, privacy/agent-context.js
- extension/src/actions/{geometry,execute-click,execute-browser}.js
- extension/src/shared/action-contract.js, transport/planner-client.js, popup/manifest
- server/app/{schemas,ai_contract,ai_input,ai_planner,nvidia_provider,config,main}.py
- extension/tests/{action,browser-actions,browser-actions-integration,agent-controller,agent-integration}.test.mjs
- server/tests/test_actions.py, demo/search.*, docs/TESTING.md

Commands from root: npm test; npm run build; npm run check; npm run scan:secrets.
Server tests from server/: .venv/Scripts/python.exe -m unittest discover -s tests.
Live smoke from root: node scripts/smoke-planner.mjs --ai (user's restarted AI server).

## Limits and exact next step

Heuristic English OCR and detected/known-value privacy are not general PII detection.
Unknown/transformed secrets remain a limitation. Empty controls need actual safe OCR
evidence to become candidates. Synthetic ENTER may be ignored by external sites.
Only explicit NAVIGATE has a load-event wait; other transitions retain the existing
short settle and fail closed if observation fails. Tab checks cannot be fully atomic.
Worker restart drops tickets/run state safely. No private-value typing.

Phase 11C is DONE (live smoke, travel regression, and controlled multi-action workflow
all user-verified; planner-latency fix confirmed at ~1s-class per call).

**Phase 12 (unified voice + text goal) DONE:** a mic button (browser-native
SpeechRecognition/webkitSpeechRecognition, popup-only, no cloud/key/audio storage)
fills the SAME goal input; the user reviews the transcript, then the existing RUN TASK
controller runs unchanged. Voice never triggers an action itself. Unsupported browsers
disable the mic and show a fallback message; text mode is unaffected. No server change.

**Phase 13A (autonomous STOP/completion semantics) DONE:** the controller used to
return `COMPLETED` for every STOP, so a run that took no action — no usable target,
or unsafe to continue — was shown as **TASK COMPLETE**. Root cause was contractual,
not cosmetic: the reason vocabulary had no way to say "achieved", so STOP carried
success and failure at once. One success reason was added to the canonical enum,
and `shared/outcome-contract.js` now owns the single reason -> outcome mapping
(fail-closed: unknown/absent reason => STOPPED, never COMPLETED). The popup renders
TASK COMPLETE / TASK STOPPED / TASK FAILED / TASK CANCELLED from fixed display text
keyed by code — no server or page string is rendered. Deterministic mode cannot
observe completion, so none of its STOP reasons reports success; only AI mode can
complete a run. Controller guards (max steps, cancellation, stale observation,
planner/privacy fail-closed, duplicate detection) and all action behaviour are
unchanged, as is the manual Analyze/Plan/Execute path.

Next phase (not started): final evaluation metrics + demo polish + submission cleanup.
Do not start vault/TYPE_LOCAL_REF, TEE, Raspberry Pi, another browser, or a new
perception engine without the user assigning it.
