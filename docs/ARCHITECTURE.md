# EdgeSight — Architecture

## Current scope

SIH26171: privacy-preserving on-device visual perception for lightweight browser agents.
Phases 1–3 remain the privacy foundation. Phase 4 OCR is implemented; Phase 5 is not started.
Screenshot capture and deterministic masking do not constitute pixel understanding.
The Phase 4 section below adds local OCR. No server, remote transport, LLM, planner, actions or Pi.
Phase 4 adds offscreen permission and minimal local-only CSP changes, detailed below.

## Phase 1–3 analysis transaction (retained foundation)

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
| Raw captured PNG | local worker/redaction/OCR transaction | Never |
| Raw OCR blocks/text | offscreen engine + local privacy transaction | Never |
| Safe visual state | post-inference geometry/text filter + guard | Separate guarded candidate |
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

## Phase 4 — browser-local OCR/CV perception baseline

The prototype uses Tesseract.js **6.0.1**, tesseract.js-core **6.1.2**, and
@tesseract.js-data/eng **1.0.0**, pinned in package-lock.json. It is an English LSTM OCR
baseline running through WebAssembly, not a ViT or general UI/object detector. This one
engine meets the deadline without adding a second inference framework. Future quantized
ViT/ONNX models can replace it behind the same image-input → normalized-items → privacy-filter interface.

### Local runtime and CSP

An offscreen extension document hosts the Web Worker because MV3 service workers cannot
construct it. Only captured image dimensions/PNG bytes cross into that host. Worker/core/
language paths all resolve to this extension. The installed 6.x getCore implementation
selects `tesseract-core-lstm.wasm.js` or `tesseract-core-simd-lstm.wasm.js` for OEM=1 with
legacyCore=false. These 6.1.2 files embed their WASM bytes, so no separate binary download
is required. English `4.0.0_best_int/eng.traineddata.gz` is packaged alongside them.

The reproducible package script copies only runtime, worker, two LSTM cores, English data
and licenses (18 assets/license files, 11,090,774 bytes). Inventory includes SHA-256 hashes.
No source maps, legacy cores, node_modules, temporary PNGs or npm caches are committed.
Tesseract.js/core are Apache-2.0. English npm metadata declares MIT; upstream trained-data
repository specifies Apache-2.0. Complete upstream licensing is shipped and explained in
[vendor/ocr/README.md](../extension/vendor/ocr/README.md).

CSP changes are limited to script-src 'self' **'wasm-unsafe-eval'** (compile packaged WASM),
worker-src **'self'** (local worker), and connect-src **'self' data:** (read local traineddata and embedded WASM bytes).
No remote hosts, unsafe-eval, blob worker or telemetry is enabled. workerBlobURL=false and
cacheMethod=none avoid blob imports and IndexedDB model caching. Runtime DevTools may show
chrome-extension:// asset reads; the required external OCR/model/CDN network count is zero.
Browser offline/network behavior is still a manual check, not an observed pass here.

Implementation follows [Tesseract 6.0.1 API](https://github.com/naptha/tesseract.js/blob/v6.0.1/docs/api.md)
and inspected installed source, plus Chrome's [offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
and [MV3 CSP guidance](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).

### Pixel source and privacy order

```text
captureVisibleTab raw PNG
  → offscreen host → decode PNG base64 to Uint8Array → worker.recognize(bytes)
  → untrusted raw OCR data (text + blocks), extension-local only
  → normalize line boxes/confidence → sensitive image-region overlap filter
  → known-value and obvious-PII filtering → final recursive/canonical guard
  → safe visual state (no DOM/visual fusion yet)
captureVisibleTab raw PNG
  → Phase 3 Canvas masks → private sanitized-image capability → guarded package
```

The latest user instruction permits raw pixels inside trusted local OCR, superseding the
previous sanitized-input-only policy (D23). Phase 3 redaction runs first operationally to
obtain measured dimensions and previews, but OCR receives the captured raw PNG unchanged.
Only the sanitized-image capability can enter image packaging. No raw OCR result is sent
to the popup, persisted, logged or packaged. Extension-internal messages carry raw image
bytes to the offscreen host and raw recognition data back to the service worker locally.

`ocr.js` imports no observer/classifier and accepts no DOM strings, labels, vocabulary,
selectors or recognition hints. Sparse-text PSM=11 is a layout setting; no fallback exists.
Tests assert the captured bytes reach inference, no geometry/value list reaches the host,
and the OCR implementation contains no DOM-text access. DOM signals enter only the
post-inference privacy filter; safe OCR text is actual engine output, never DOM text.

The existing Phase 3 mapping converts sensitive CSS rectangles using measured screenshot
width/viewport width and height/viewport height, rounded outward and clamped. For each
normalized OCR line, any positive intersection with a sensitive image rectangle expanded
by two image pixels removes the entire line. This intentionally errs toward withholding
nearby safe text. No resizing occurs. Invalid geometry or mismatched dimensions fail closed.
Known sensitive values (NFKC/case/punctuation/whitespace normalized), obvious email strings,
seven-or-more-digit phone-like strings and EMP-number patterns also remove whole lines
outside the boxes. No vocabulary allowlist remains. These rules are conservative and do
not identify every unknown name, address, secret or misrecognized/encoded PII string.

The privacy layer copies only supported fields, discarding full engine text, nested raw
blocks and other raw outputs. Known values are checked across retained lines to catch
fragmented leaks, and the final safe schema passes the recursive Phase 3 guard. A residual
UNSAFE result revokes visual output and candidate package/previews; safe counts remain.
Ordinary engine errors/timeouts preserve Phase 1–3 results without visual data. Explicit
raw field-value strings remain in the service-worker privacy transaction, never the OCR
host; their visual pixel content may of course be recognized by the local engine.

### Phase 5-ready result

The raw local engine envelope is `{data:{text,blocks}, width, height, timing}`; blocks
contain paragraphs and lines with engine text, bbox `{x0,y0,x1,y1}` and confidence.
This envelope is consumed only by the privacy layer and is never an outbound schema.

The separate `safeContext.visual` contains engine/version, image dimensions, timing,
processingMs, coordinateSystem=screenshot-pixels, withheldItems and line-level items:
`{id, text, bbox:{x,y,width,height}, confidence}`. Boxes are actual engine coordinates
clamped to original screenshot bounds. Confidence is actual 0–100 engine confidence
converted to 0–1; missing/invalid confidence is null. It is not a calibrated probability.
The module copies only these supported fields and rejects malformed geometry/results.
Empty recognition produces Empty, not invented targets or checkmarks.

No resize is performed; OCR boxes already share the screenshot pixel frame. Images over
20 million pixels are rejected for OCR only, rather than risking excessive memory. DOM
rectangles remain viewport CSS pixels from the observer; Phase 5 must use the Phase 3
mapping before spatial matching. Visual IDs are observation-scoped: visual_1, visual_2, etc. Filtering preserves IDs and
boxes (gaps are allowed); IDs are not stable after a new observation. Full fusion and
actions are not implemented in Phase 4.

### Timing, lifecycle and UI

performance.now measures actual initialization, inference, cleanup and total engine processing.
Cold includes worker/language initialization; warm reuses the loaded worker. Timing excludes
capture, redaction, messaging and post-OCR sanitization. The warm worker is disposed after
120 seconds idle. After every inference, the engine receives a constant 16×16 white PNG
with text/blocks output disabled. Inspected 6.0.1 source sets that image but skips recognition,
replacing the retained raw raster without reloading English data. The /input MEMFS file is
then removed. Cleanup failure terminates the engine and returns no raw result. Total engine
time includes cleanupMs; no browser storage or secure memory-zeroization claim is used.

A 45-second host deadline handles missing language/core files, WASM failure and unreasonable
inference. Timeout closes the offscreen host, terminating even an initialization-hung worker;
subsequent analysis can recreate it. Unsupported offscreen capability reports unavailable.
Worker and host busy checks serialize analyses. Popup closure does not interrupt trusted
processing; a later popup may retry after the run, without storing the closed popup's result.
While that bounded transaction is pending, the bridge calls the local getContexts API
every 10 seconds and clears this activity on every completion/failure/timeout. Chrome
documents a 30-second idle limit and that extension API calls reset it (Chrome 110+):
[service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
This avoids relying on a silent 45-second pending response. No idle keepalive or storage
is introduced; browser lifecycle behavior is still part of the pending manual checks.

The popup displays real safe OCR lines, confidence, boxes and cold/warm timing. A Canvas
overlay draws returned boxes on the sanitized image only. Nothing is transmitted. The
existing preview expiry/cleanup remains. All P4-M checks remain UNVERIFIED; the automated
real engine result below is Node/WASM on synthetic pixels, not a Chrome acceptance test.
