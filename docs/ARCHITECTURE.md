# EdgeSight architecture — Phase 8

SIH26171 / ISRO: on-device visual perception for lightweight browser agents.

```text
Browser screen
 ├─ local semantic observation → value-free sensitive-field classification
 └─ captureVisibleTab raw PNG → extension-local OCR/WASM → untrusted raw OCR
Local PII detection
 ├─ Canvas masks → private sanitized-image handle → LOCAL previews
 ├─ semantic allowlist / [ROLE] placeholders
 └─ OCR geometry overlap + known-value/obvious-PII filtering
Safe semantics + safe visual items + observation metadata + guarded goal
 → SafeAgentContext → FINAL LOCAL PRIVACY GUARD + immutable approval
================ NETWORK BOUNDARY ================
structured JSON POST http://127.0.0.1:8000/plan
 → strict FastAPI/Pydantic validation → deterministic planner OR explicit AI mode:
   minimized/revalidated safe input → provider privacy guard → NVIDIA NIM LLM
   → untrusted structured output → strict action/visual-ID validator
 → observation-bound CLICK / STOP → client validation → decision display
================ BACK IN THE BROWSER (Phase 7, local only) ================
CLICK visual_N → LOCAL bbox for the SAME observation → screenshot px → CSS viewport px
 → document.elementFromPoint → clickable-element allowlist + safety validation
 → ONE guarded, single-use element.click()   (STOP → no browser action)
================ FRESH LOCAL VERIFICATION (Phase 8, no network) ================
750 ms → same intended active tab → NEW capture/observation → local OCR/privacy again
 → approved safe visual text → full Travel Request Submitted phrase
 → VISUALLY VERIFIED / NOT VERIFIED (no recovery action)
```

Phase 6B calls one real server-side provider adapter; no image upload.
Phase 7 adds LOCAL execution of a validated CLICK: the server chooses WHAT (visual_N),
the browser resolves WHERE/HOW from the local bbox and clicks once. No screenshot,
selector, coordinate or code ever comes from the server. Designs are recorded in
[PHASE_6B_PLAN.md](PHASE_6B_PLAN.md), [PHASE_7_PLAN.md](PHASE_7_PLAN.md) and
[PHASE_8_PLAN.md](PHASE_8_PLAN.md); the Phase
6A request/action JSON and local approval architecture remain unchanged.

## Local observation, perception and privacy

The service worker accepts Analyze / Plan messages only from its own popup, rejects
overlapping runs, and observes the active tab through programmatic injection.
The temporary value collector is separate from value-free field classification.
Active tab/document and before/after structure, geometry, viewport and value
comparisons block observable capture changes. This is not an atomic DOM/pixel snapshot.

Phase 3 uses actual decoded screenshot dimensions to map CSS rectangles:
scaleX = screenshotWidth / viewportWidth; scaleY = screenshotHeight / viewportHeight.
Edges round outward and clamp to image bounds. Invalid geometry, unsupported pinch
zoom/panning and failed redaction block. Original local preview always masks password
regions; sanitized preview masks all known sensitive fields.

`privacy/redact.js` privately mints a WeakMap image handle only after Canvas redaction.
Raw PNG strings and forged handles cannot enter its guarded package builder.
The image accessor remains local; transport never imports it. Phase 6B is an LLM
over sanitized structured visual context, not a VLM integration.

Tesseract.js 6.0.1, WASM core 6.1.2 and packaged English data run in an offscreen
Web Worker. Raw PNG bytes/dimensions are its only inference input; no DOM labels,
known-value list or semantic fallback goes into OCR. Actual raw recognition returns
only to the local privacy transaction. Whole lines overlapping sensitive rectangles
plus a two-pixel margin are withheld. Known values and obvious PII patterns remove
other unsafe lines; residual fragmented known-value leaks revoke output and previews.
Ordinary OCR errors preserve Phase 1–3. IDs and boxes come from actual OCR.

OCR has a 45-second bound, 120-second idle disposal and bounded extension API activity
while pending. After inference its raster is replaced with a blank and input file
unlinked; resources and raw-value references are released. No secure-memory-erasure
claim. OCR assets are committed locally; no runtime CDN/model download.

Semantic fields use [NAME], [EMAIL], [PHONE], [EMPLOYEE_ID], [PASSWORD] with filled
booleans. Only Bengaluru and the four supported Purpose values are retained as
non-sensitive values; unknowns are [WITHHELD]. Labels/titles/arbitrary DOM strings
are omitted. This is the static travel-demo privacy scope.

## Canonical context and transport capability

`privacy/agent-context.js` whitelists safe semantic fields and safe visual items,
with separate provenance, observation ID/timestamp, image/viewport metadata,
privacy summary, goal (string normalized/capped at 500 chars) and fixed redaction
legend. It recursively checks keys and values against locally known sensitive values
and scans the exact serialized bytes. Failure returns BLOCKED; unsafe OCR revokes
context upstream. No raw image or raw OCR is part of this schema.

After the final gate, the builder deep-freezes the context and privately records
context identity → approved JSON in a WeakMap. This record stores **safe bytes only**.
`prepareAgentContextForTransport(context)` requires that identity, a frozen object,
a clean JSON structure and exact byte equality with the approved serialization.
There is no registration/cast API. Rehydrated JSON, clones, proxies, full local
responses and contaminated candidates fail before fetch. The transport-side check
verifies the final known-value gate's immutable result without receiving or retaining
the raw known-value list. The service worker clears that list before requesting a plan.

`transport/planner-client.js` imports only this approval function and
`transport/config.js`. Its sole application-data input is SafeAgentContext; test
options inject fetch/deadline only. It cannot normally access Phase 1–4 objects.
The popup sends the explicit analysis intent and renders the result; it contains
no fetch logic. Opening it does not cause transport.

**The only application data crossing EdgeSight's network boundary is the
privacy-guarded SafeAgentContext. The transport layer has no normal interface to
raw screenshots or raw OCR results.** Image transport is not enabled. This architectural
boundary cannot prevent a future developer deliberately removing it.

## HTTP and response boundary

POST uses JSON content type, no credentials/referrer/cache and redirect:error.
Twenty seconds bounds fetch and body parsing, with AbortController cleanup;
provider work is independently bounded to fifteen seconds.
HTTP 4xx, malformed JSON and invalid plans return REJECTED; network/5xx/timeout
return UNAVAILABLE. Local Phase 1–5 output remains available in either case.

Server `app/schemas.py` implements strict nested extra-forbid models, geometry,
confidence, ID/provenance and redaction/summary consistency validation. Generic 422
errors omit rejected input. Normalized fake canaries and conservative free-text PII
patterns provide defence in depth. Server validation cannot undo a client leak.

Server `app/planner.py` matches the normalized travel demo goal, requires one filled,
non-withheld field for each of seven roles, and exactly one trimmed/case-insensitive
Continue visual element. It returns that ID as CLICK; otherwise STOP with null target.
See [server README](../server/README.md) for the complete wire contract.

Responses contain only schemaVersion, observationId, action, target and reason.
Client checks exact keys/version/types, action CLICK/STOP, matching observation ID,
and exactly one current visual ID for CLICK. STOP requires null. Server reasons are
not rendered; the popup uses the locally guarded target text. There are no selectors,
XPath, JavaScript, arbitrary coordinates or execution calls. IDs are scoped to the
submitted observation; they are not stable after another observation. Actual page
freshness at future execution time remains Phase 7's responsibility.

## Phase 6B provider boundary

PLANNER_MODE chooses deterministic (default, original logic unchanged) or ai.
There is no fallback when AI fails. The only AI adapter uses NVIDIA NIM's
OpenAI-compatible Chat Completions endpoint with model
nvidia/nemotron-3.5-lightning-30b-a3b, temperature=0, response_format=json_object,
enable_thinking=false, no tools/conversation, bounded output, redirects/retries/
environment proxies disabled. httpx is the sole HTTP dependency and doubles as the
OpenAI-compatible client; no openai SDK, routing or agent framework.

The AI entry accepts a JSON-shaped candidate, takes a JSON snapshot and revalidates
the complete SafeAgentContext BEFORE projection. Nested extra keys, fake PII and
model-instance validation bypasses block before provider invocation. ai_input.py
then explicitly copies only goal, safe privacy flags, semantic role/sensitive/filled/
safe value fields, pixel-OCR ID/text/confidence, and the existing redaction legend.
It guards the exact serialized JSON again and rejects inputs over 32KB. Observation
ID, timestamp, geometry/dimensions, field IDs and debug/extension metadata stay local
to our server. The provider receives the JSON string, not the internal context.

Fixed system instructions are separate from user-role observational JSON. Both
goal and screen text are untrusted data that cannot override policy. The prompt
distinguishes local-browser-semantics from local-pixel-ocr, forbids reconstruction
of placeholders, and treats only filled=true as evidence of a local value. It asks
for a decision, never hidden reasoning. Prompt separation is not a proof of perfect
model behavior under injection.

Model output is exactly action/target/reason. The reason must be one of four short
safe phrases (ai_contract.py), so arbitrary private/executable explanation text is
rejected. Duplicate JSON keys, unknown actions/IDs, null CLICK or non-null STOP,
extra properties, selectors/code/coordinates/URLs, refusals and incomplete output
are rejected without repair. The model never controls schemaVersion/observationId;
ai_planner.py binds them from the local validated snapshot after ID membership checks.
Schema validation constrains the response but does not prove the action is correct.

Provider authentication is read only in the server adapter and used only as protocol
authentication, never model content. No payload/header/exception logging. Fifteen
seconds bounds provider work and 64KB bounds its response envelope. Generic 503 for
missing key/network/status failures; 504 for timeout; 502 for invalid model/refusal
output; 422 for unsafe/oversized input. Health remains available with a missing key.

The exact five-key Phase 6A action JSON is unchanged. X-EdgeSight-Planner is a separate
allowlisted/exposed header (ai or deterministic), surfaced by the popup even on
server-reported AI failure. Missing/unrecognized mode reports Unknown, never inferred
AI success. No latency metric is added. Explicit Analyze / Plan still initiates all
browser transport; Phases 1–5 survive planner failure.

## Phase 7 execution boundary

The server chooses WHAT to click (`CLICK visual_N`); the browser decides WHERE and HOW,
entirely locally. After a validated CLICK, the service worker mints one LOCAL, single-use
execution ticket (`actions/execute-click.js`) bound to the observation id, target visual
id, tab id, window id and document id — none of which are ever sent to NVIDIA or FastAPI.
`ticketForPlan` refuses to mint unless `plan.observationId` matches the local context and
the target exists in `visualElements` (defence in depth beyond the transport validator);
STOP mints nothing and performs no action.

`EXECUTE SUGGESTED ACTION` in the popup triggers execution. The policy gates, in order:
absent/consumed ticket → ACTION_ALREADY_CONSUMED; older than the 60s TTL →
STALE_OBSERVATION; tab missing or no longer the active/current-window tab → TAB_CHANGED;
navigated URL → PAGE_CHANGED; bad geometry → INVALID_GEOMETRY/OUT_OF_VIEWPORT; target
overlapping a redacted sensitive region ≥25% → SENSITIVE_REGION. Only then is the ticket
consumed and ONE `chrome.scripting.executeScript` dispatched, pinned to the observed
documentId so a navigated-away document rejects.

Geometry (`actions/geometry.js`) converts the LOCAL screenshot-pixel bbox center to a CSS
viewport point (`scaleX = viewport.width / screenshot.width`, per axis; no
devicePixelRatio==1 assumption). The injected `clickInPage` re-checks the viewport (resize
→ PAGE_CHANGED), runs `document.elementFromPoint`, walks up ≤6 ancestors to a supported
control (`button`, `input[type=button|submit]`, `[role=button]` — no generic clickable
rule), and validates it is connected, not `disabled`/`aria-disabled`, has a non-zero
visible rect containing the point, is not covered by an unrelated element, and is text-
consistent with the OCR target. It performs exactly one `element.click()` and returns a
fixed status/reason code — never DOM nodes, HTML or page text. No selector, coordinate or
code from the server is ever used; no eval/Function/CDP/automation library. Phase 7 does
NOT itself re-observe: its result is "CLICK DISPATCHED". The worker now follows a
successful dispatch with the separate Phase 8 transaction below.

## Development network policy

One endpoint in config; manifest host permission `http://127.0.0.1/*`, plus CSP
connect-src `'self' data: http://127.0.0.1:8000`. Chrome host match patterns do not
restrict ports; CSP supplies the port restriction. Script/worker/WASM policy and
activeTab/scripting/offscreen permissions otherwise retain their existing scope.

FastAPI binds 127.0.0.1. CORS permits one explicitly configured extension origin,
GET/POST and Content-Type, no credentials or wildcard. Other supplied origins block
before planning. Requests without Origin are supported for local clients; CORS is
not authentication. The app logs/persists no bodies. Uvicorn runs with access logs off.
CORS additionally exposes the safe planner-mode header. Provider HTTPS is server-side
only; Chrome manifest/CSP and loopback permissions are unchanged in Phase 6B.
See official [CORS](https://fastapi.tiangolo.com/tutorial/cors/) and
[Pydantic strict mode](https://docs.pydantic.dev/latest/concepts/strict_mode/) documentation.

## Limits and verification

No general PII detector, unknown pixel masking, iframe/shadow-root traversal or
face/object detector. Phase 7 execution is limited to ONE guarded click on a button-like
target; no typing, navigation, scroll, downloads or multi-step actions. OCR can miss/
misread Continue; multiple matches stop. Confidence may be null and is not a calibrated
probability. Visual text is not proof of a clickable control (hence the local element
allowlist and validation at click time). Local previews expire on close, re-analysis or
60 seconds; nothing is persisted.

Phase 6A is user Chrome-verified: POST /plan → FastAPI 200; seven safe fields, five
sensitive/redacted regions, safe status/false PII flag, five placeholders, retained
Bengaluru/Conference and working deterministic flow. No unreported checks inferred.
Phase 6B server-side NVIDIA smoke and Chrome AI acceptance remain pending because no
NVIDIA_API_KEY was configured this session (the NVIDIA endpoint itself was verified
out-of-band by the user). Mock tests and local HTTP missing-key tests are not real-model
verification. NVIDIA data retention is governed by NVIDIA's policy.

Phase 7 execution logic is covered by automated tests (geometry, observation/target
binding, tab/page/stale policy, replay, and element safety against a DOM stub). The
manual Chrome click demo — real Analyze/Plan → Execute → the actual Continue button
clicked → submitted page appears — and the negative stale/wrong-page demo remain PENDING;
the unpacked extension was not loaded in the coding shell. Deterministic mode is
sufficient for that manual test when no key is available.

## Phase 8 local observation and evidence boundary

background/local-observation.js extracts the original Phase 1-5 transaction without
copying it. Analysis uses its existing safe result envelope, then calls requestPlan
and mints the ticket. Post-action verification calls the same transaction with an
empty local goal. Neither local-observation.js nor verification modules have a network
interface, planner call or ticket creation. Packaged OCR resources remain local.

verify-after-click.js starts only after EXECUTED. Wait 750 ms, then make one observation.
Before capture require the action tab to exist, retain its intended window, and be the
active tab in the current window. The shared transaction rechecks active tab before
and after capture; verification checks again after perception. A switched/missing tab
returns NOT_VERIFIED / TAB_CHANGED. No unrelated page can be accepted as evidence.
Post-action navigation is allowed: never use the old documentId or URL as a gate.
Snapshot the current document, pin the within-capture second snapshot to that new
document and retain the original consistency comparison. A transition during capture
fails safely. Checks are not atomic and cannot detect every away-and-back tab switch.

Each invocation captures fresh PNG bytes, mints obs_<UUID>, records capturedAt, decodes
fresh dimensions and invokes OCR again. visual_N IDs are regenerated from those pixels
and scoped to the new observation. The matcher rejects equal action/verification IDs
or capturedAt <= dispatchedAt. No old image, bbox, OCR or agent context is an input to
post-action observation. Only local tab binding metadata is carried across the action.

Privacy runs again: field classification, transient local value collection, Canvas
redaction, semantic allowlist, OCR geometry/known-value/obvious-PII filtering and final
SafeAgentContext guard. The verifier consumes only the already-approved frozen context;
only source=visual items are searched. Approval checking uses the existing local
prepareAgentContextForTransport capability check but invokes no transport. DOM fields,
planner reasons and server text cannot supply success evidence. No post-action image,
raw OCR, DOM, private value or arbitrary matched text enters the result/popup message.

Local specification: VISUAL_TEXT / Travel Request Submitted. Normalize NFKC, case,
whitespace and spacing around common punctuation; retain punctuation. Require the full
phrase with Unicode word boundaries, no spelling fuzziness or partial phrase matches.
A punctuation mark inserted between the words does not match. Supporting text is not
required. Order boxes top-to-bottom into fixed rows (50% vertical overlap), then by x.
Join at most three consecutive spatially adjacent items: same-row gap <=2 maximum
heights, or successive lines with horizontal overlap and vertical gap <=1.5 maximum
heights. Do not join unrelated columns or distant boxes. Confidence is the existing
actual 0-1/null value per contributing ID, with no calibrated score/threshold claim.

Result metadata: VERIFIED / NOT_VERIFIED; fixed reason on failure; old/new observation
IDs; known expected phrase, source, contributing visual IDs/confidences; actual SAFE
privacy only after a successful privacy rerun; numeric timing hooks. No network use.
Failure reasons: NO_VISUAL_MATCH, CAPTURE_FAILED, PERCEPTION_FAILED, PRIVACY_FAILED,
TAB_CHANGED, TIMEOUT; defensive matcher gates STALE_OBSERVATION and INVALID_SPEC.
OCR bridge retains its existing combined error/timeout contract (PERCEPTION_FAILED),
while local diagnostics distinguish OCR_TIMEOUT. No uncontrolled page-derived errors.

One attempt, no retries. Delay 750 ms suits the synchronous demo transition; slower
pages can return no match. Five seconds bounds each local API/redaction await, OCR has
its existing 45-second bound, and 60 seconds bounds the verification transaction.
Abort prevents further stages and late acceptance; already-running platform work may
finish before resource/reference cleanup. No secure memory erasure claim.
Actual counters: epoch dispatch acknowledgement/completion timestamps; monotonic actual
delay, capture, perception (includes visual filtering), matching and total duration.
Unavailable failure-stage timings are omitted. These are hooks, not Phase 9 metrics.

Worker rejects overlapping Analyze/Execute. Popup displays CLICK DISPATCHED -> VERIFYING
-> VISUALLY VERIFIED / NOT VERIFIED, known expected evidence, old/new observation IDs
and actual privacy. It preserves the pre-action guarded Continue display. Only the safe
verification metadata is retained in worker memory and read when the popup reopens;
new analysis resets it, worker teardown loses it. No storage or new permissions.

Phase 8 code is automated-test verified; positive and negative Chrome runs remain
PENDING. The current session launched Chrome but Computer Use stopped because the
browser URL could not be reliably determined for policy enforcement. No actual Phase 7
click or Phase 8 visual verification was observed. A visible phrase at capture time is
not proof of backend persistence, causality, or arbitrary-goal completion. English OCR,
unknown-PII limitations and possible cross-origin activeTab revocation remain.

## Phase 9 - evaluation and numeric runtime measurements

The benchmark CLI is separate from live browser orchestration. Five committed fake
PNGs go through actual Tesseract/WASM and safe visual filtering; independent expected
text labels are only used by the scorer. Forty labeled field signals go through the
actual detector. Three region layouts exercise real redaction with an instrumented
Canvas adapter; evaluation concerns final mask commands, not native rendered pixels.
Versioned JSON separates visual/PII/redaction quality from runtime resources/latency.
Source/fixture hashes, all numeric runs, environment and limitations are retained.
Default output is ignored; reviewed reference JSON and Markdown table are committed.

metrics/metrics.js supplies pure statistics, strict normalized item/source scoring,
confusion counts, one-to-one IoU region scoring and numeric timing projection. It has
no DOM, storage or network. The Python helper benchmarks actual validation, safe
provider projection, deterministic planner and temporary loopback HTTP. No provider
request by default; NVIDIA timing is opt-in and remains pending without a key.

The shared local observation transaction records monotonic capture, detector,
redaction, semantics/guard, perception, visual/context guard and total durations.
The worker adds actual planner round-trip, action preparation/dispatch, plan and
post-execution timing. Human confirmation is separate; machine total sums plan and
post-execution processing for the same observation. The existing Phase 8 delay,
fresh capture/privacy and matching timers are reused. No timing changes the success
predicate or adds a request/action. Timings are numeric local siblings, never part of
SafeAgentContext or provider content. Images/text/private values are not metrics.

Popup Performance displays current-run values, initially --. Live popup intervals
include message transport; reopened summaries use worker intervals. Parent/child
stages overlap and must not be summed twice. Server-Timing adds fixed numeric
prehandler/planner headers, preserving the exact action JSON. Prehandler is combined
routing/parsing/validation, not pure validation. No one-way network inference.

METRICS.md defines every formula, count, timing boundary and measured result. The
controlled benchmark does not establish general screen accuracy, native mask opacity,
CPU/GPU/RAM usage or Chrome end-to-end latency. Phase 6B/7/8 manual evidence and
Phase 9 live Chrome timings remain PENDING. Phase 10 is not implemented.
