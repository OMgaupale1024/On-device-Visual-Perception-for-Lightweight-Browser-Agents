# EdgeSight — Architecture

## Current scope

SIH26171: privacy-preserving on-device visual perception for lightweight browser agents.
Phase 3 is implemented; Phase 4 is not started. DOM assists privacy and grounding.
Screenshot capture and deterministic masking do not constitute pixel understanding.
There is no server, network transport, LLM, OCR, CV model, planner, autonomous action or Pi.
Permissions remain activeTab + scripting; extension CSP has `connect-src 'none'`.

## Analysis transaction

1. The popup requests ANALYZE_PAGE. The worker checks its sender and rejects overlapping
   runs; the popup clears stale results and previews before each request.
2. `observePage` runs in Chrome's isolated world: counts, structural signals, stable IDs,
   CSS rectangles, viewport and scroll position. It never reads values. A WeakMap retains
   identity for the same element/document across reordering and repeat analysis; a
   transient ID-to-element map supports the separate collector.
3. The unchanged Phase 2 classifier classifies type/name/id/label/autocomplete signals
   only. Labels are untrusted metadata, not certified outbound strings.
4. Separate `collectLocalValues` temporarily reads values and returns them only to the
   trusted worker. It clears element references in finally. Known sensitive values
   repeated in visible body text or document title block locally, because field masks
   would not cover those copies. That text is not returned.
5. The worker checks active-tab identity, captures PNG pixels, rechecks identity, and
   repeats observation/value collection against the same documentId. Changed geometry,
   structure, viewport, scroll or values block. Pinch-zoom/panned viewports block.
6. `redactScreenshot` decodes actual PNG dimensions and black-masks mapped sensitive
   regions. It mints an opaque handle in a private WeakMap only after success.
7. Semantic sanitization emits IDs, fixed roles, placeholders and filled booleans.
   Labels/titles/attributes/arbitrary text are omitted. Unknown values are withheld.
8. `buildOutboundPackage` requires a genuine sanitized-image handle. It guards candidate
   semantics, clones them, guards the complete package and recursively freezes it.
   Failure produces no safe context or previews. No transport exists.
9. The popup receives safe context plus a separately named LOCAL-ONLY original preview.
   Finally blocks drop raw screenshot/value references; bitmap.close and Canvas reset
   release rendering resources. No raw field-value strings reach popup, logs, errors,
   storage, files or network.

## CSS-to-image coordinates

getBoundingClientRect returns viewport-relative CSS pixels. Only visible fields
intersecting the viewport participate. Screenshot dimensions are image pixels measured
by createImageBitmap, not guessed from devicePixelRatio.

```text
scaleX = screenshotWidth / viewportWidth
scaleY = screenshotHeight / viewportHeight
left   = floor(rect.x * scaleX)
top    = floor(rect.y * scaleY)
right  = ceil((rect.x + rect.width) * scaleX)
bottom = ceil((rect.y + rect.height) * scaleY)
```

Clamp every edge to image bounds. Round outward to cover fractional borders. Independent
ratios support HiDPI/nonuniform dimensions. Invalid/zero dimensions and missing or fully
offscreen sensitive boxes block. Pinch zoom requires another origin mapping and is
rejected. Ordinary browser zoom uses measured ratios. DPR is diagnostic only.

## Trust levels

| Representation | Lifetime/location | Future outbound |
|---|---|---|
| Raw values | local collector + worker transaction | Never |
| Raw captured PNG | worker/redaction call | Never |
| Local original preview | password-masked popup PNG, at most 60 seconds | Never |
| Source labels/title/signals | local transaction, untrusted | Never copied directly |
| Sanitized image handle | private redaction WeakMap | Required builder input |
| Frozen safeContext | guarded semantics + sanitized PNG | Only candidate for future transport |

`redact.js` owns handle minting and package construction; it exposes no register/cast
API. Raw data URLs and lookalike objects are rejected. `safeContext` contains semantic,
image (dataUrl, dimensions, redactedRegions), and fixed scope `visible-dom-fields`.
The builder never receives raw pixels or the original preview. Where sensitive boxes
exist, the sanitized PNG must differ from raw or processing blocks; this equality
check supplements, rather than proves, pixel correctness.

The ORIGINAL — LOCAL ONLY preview always masks password regions, including revealed
passwords. Other sensitive values appear only as pixels in this intentionally local
comparison image. Raw field-value strings never go to the popup. Preview sources clear
on re-analysis, pagehide or 60-second expiry. No screenshots are persisted.

Phase 6 transport must consume only guarded `safeContext`, never the full response
(which contains localPreview), and preserve the builder and contamination tests.
New goals/action labels/text must enter sanitization and guard before packaging.
The current structural API/CSP prevent an accidental raw-image path; they cannot
prevent a future developer deliberately adding a bypass or removing safeguards.

## Text policy and guard

Sensitive placeholders: [NAME], [EMAIL], [PHONE], [EMPLOYEE_ID], [PASSWORD]. Empty
sensitive fields still use placeholders; filled reflects whether the value is nonempty.
All source text is untrusted. Destination permits only Bengaluru. Purpose permits only
Conference, Training, Client Visit, Site Inspection. Matching field name and ID must
identify those demo roles. All other non-sensitive values become [WITHHELD]. Fixed
popup role labels come from an internal dictionary, never arbitrary DOM text.

`guard.js` scans JSON string values and keys recursively for exact known nonempty
sensitive values. Numeric scalars are checked as text. Cycles, accessors, custom object
types, invalid inputs and traversal errors fail closed. Empty known values are ignored.
Matches return `{safe:false, reason:"Sensitive data detected in outbound payload"}`;
clean payloads return `{safe:true}`. Errors never identify offending values. Short
values can conservatively block safe strings. This is exact-value checking, not
recognition of transformed/encoded secrets or unknown PII, and cannot inspect pixels.

## Limits and verification

Supported target: the static fake-data Employee Travel Request form. Current masks
cover detected visible standard DOM fields. No shadow-root/iframe traversal, unknown
PII recognition in images/canvas/text, face detection, or text-overflow handling.
Before/after snapshots reduce races but cannot detect every transient change that
reverts between snapshots. SAFE is scoped to detected DOM fields, not certification
for arbitrary-site upload. Unknown pixel privacy and actual perception are Phase 4+.

Immutable JS strings are garbage-collected: reference cleanup shortens lifetime but
is not secure memory zeroization or erasure of browser-internal copies. The local
original preview deliberately retains PII pixels briefly; use fake demo data.

Node tests cover pure functions, observer fixtures and browser API doubles. Real Canvas
pixel behavior and Chrome capture alignment remain UNVERIFIED; see TESTING.md for the
local browser harness and exact user procedure.
