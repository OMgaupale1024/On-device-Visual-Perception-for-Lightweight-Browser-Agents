# EdgeSight architecture — Phase 6B

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
 → observation-bound CLICK / STOP → client validation → suggestion display
```

Phase 6B calls one real server-side provider adapter; no image upload, browser
execution or re-observation. Design is recorded in [PHASE_6B_PLAN.md](PHASE_6B_PLAN.md);
the Phase 6A request/action JSON and local approval architecture remain unchanged.

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

No general PII detector, unknown pixel masking, iframe/shadow-root traversal,
face/object detector or browser execution. OCR can miss/misread Continue;
multiple matches stop. Confidence may be null and is not a calibrated probability.
Visual text is not proof of a clickable control. Local previews expire on close,
re-analysis or 60 seconds; nothing is persisted.

Phase 6A is user Chrome-verified: POST /plan → FastAPI 200; seven safe fields, five
sensitive/redacted regions, safe status/false PII flag, five placeholders, retained
Bengaluru/Conference and working deterministic flow. No unreported checks inferred.
Phase 6B server-side NVIDIA smoke and Chrome AI/no-click acceptance remain pending
because no NVIDIA_API_KEY was configured this session (the NVIDIA endpoint itself was
verified out-of-band by the user). Mock tests and local HTTP missing-key tests are not
real-model verification. NVIDIA data retention is governed by NVIDIA's policy.
