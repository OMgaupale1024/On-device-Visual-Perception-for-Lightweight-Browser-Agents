# EdgeSight architecture — Phase 6A

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
 → strict FastAPI/Pydantic validation → deterministic planner
 → observation-bound CLICK / STOP → client validation → suggestion display
```

No model inference on the server, image upload, browser execution or re-observation
is implemented in Phase 6A. Design inspection is recorded in
[PHASE_6A_PLAN.md](PHASE_6A_PLAN.md); chronological decisions remain in DECISIONS.

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
The image accessor remains local; Phase 6A transport never imports it.

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
Five seconds bounds fetch and body parsing, with AbortController cleanup.
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

## Development network policy

One endpoint in config; manifest host permission `http://127.0.0.1/*`, plus CSP
connect-src `'self' data: http://127.0.0.1:8000`. Chrome host match patterns do not
restrict ports; CSP supplies the port restriction. Script/worker/WASM policy and
activeTab/scripting/offscreen permissions otherwise retain their existing scope.

FastAPI binds 127.0.0.1. CORS permits one explicitly configured extension origin,
GET/POST and Content-Type, no credentials or wildcard. Other supplied origins block
before planning. Requests without Origin are supported for local clients; CORS is
not authentication. The app logs/persists no bodies. Uvicorn runs with access logs off.
See official [CORS](https://fastapi.tiangolo.com/tutorial/cors/) and
[Pydantic strict mode](https://docs.pydantic.dev/latest/concepts/strict_mode/) documentation.

## Limits and verification

No general PII detector, unknown pixel masking, iframe/shadow-root traversal,
face/object detector, LLM/VLM or browser execution. OCR can miss/misread Continue;
multiple matches stop. Confidence may be null and is not a calibrated probability.
Visual text is not proof of a clickable control. Local previews expire on close,
re-analysis or 60 seconds; nothing is persisted.

The user confirmed the pre-Phase-6A Chrome flow works. New Chrome/server payload
inspection and no-click demonstration remain pending. Automated tests and the real
Node-client → Uvicorn HTTP smoke do not constitute a manual Chrome pass.
