# EdgeSight — Decisions

Chronological record of significant technical decisions.

---

## D1 — Chrome Manifest V3 extension for the prototype

**Decision:** Build the client as a Chrome MV3 extension.
**Reason:** The problem statement is on-device perception for *browser* agents.
Browser-side execution is the whole point and lets us sanitize locally before any
server contact.
**Alternatives considered:** Bookmarklet; separate desktop app driving a browser;
Playwright script.
**Why rejected:** Bookmarklet can't hold background/service-worker structure cleanly;
desktop/Playwright moves work off the browser and weakens the "on-device in the browser"
story. Firefox/multi-browser is explicitly out of prototype scope.
**Consequences:** MV3 service-worker constraints (no long-lived background page); popup ↔
content ↔ background messaging needed.

## D2 — FastAPI planner, deterministic first, LLM optional

**Decision:** Python + FastAPI server exposing a `PlannerInterface` with `LocalPlanner`
(deterministic/mock) as the default; `LLMPlanner` optional and later.
**Reason:** The demo must be reliable and offline-capable; it must not hinge on an
external API being reachable/authenticated during judging.
**Alternatives considered:** Node/Express; go straight to an LLM planner.
**Why rejected:** Python is already available (3.10.11) and matches the interface split
cleanly; an LLM-only path adds a network + key dependency and a failure mode on the
critical demo path.
**Consequences:** Deterministic rules must be good enough to drive the demo (form filled →
CLICK Continue). LLM is a bonus, gated behind `PLANNER_MODE=llm`.

## D3 — Sanitize-before-send + outbound privacy guard

**Decision:** Detection and redaction happen in the extension; a privacy guard scans every
outbound payload for known raw sensitive values and blocks the request if any is found.
**Reason:** "Raw PII never leaves the device" is the headline claim. A guard makes it
*provable* (Raw PII transmitted = 0), not just asserted.
**Alternatives considered:** Redact on the server; trust the sanitizer without a guard.
**Why rejected:** Server-side redaction means raw PII already left the device — fails the
core principle. Trusting the sanitizer with no guard has no safety net if a field is missed.
**Consequences:** The guard needs the set of known raw values to scan against, held only
in-browser and never logged.

## D4 — Stable internal element IDs, not raw selectors, to the planner

**Decision:** Sanitized state references elements by internal IDs (`field_1`, `action_1`);
the planner acts on IDs; the extension resolves IDs → elements locally.
**Reason:** Keeps CSS/XPath internals out of outbound data and makes actions robust and
auditable.
**Alternatives considered:** Send CSS selectors/XPath to the planner.
**Why rejected:** Leaks page structure and invites arbitrary-selector actions; harder to
validate safely.
**Consequences:** The extension maintains an ID→element map per observation; must be
regenerated on re-observation.

## D5 — Strict action schema, no eval

**Decision:** Validate every planner response against a fixed allow-list of actions
(`CLICK/TYPE/SCROLL/PRESS/WAIT/STOP`); reject anything else. Never `eval` or execute
server-supplied JavaScript.
**Reason:** The planner (especially an LLM) is untrusted input crossing into page execution.
**Consequences:** Adding a new action type is a deliberate schema change, not an accident.

## D6 — Real files only in Phase 0; no empty scaffold tree

**Decision:** Create only files with real content in Phase 0. Document the full intended
directory tree in ARCHITECTURE.md; create deeper folders when a phase first fills them.
**Reason:** Git can't track empty directories, and `.gitkeep` litter across a dozen
speculative folders is exactly the scaffolding-for-later we want to avoid. Top-level stub
READMEs give a visible map without the clutter.
**Alternatives considered:** Create the whole `src/{popup,content,...}` tree now with
`.gitkeep`.
**Why rejected:** Adds noise, no behavior, and misrepresents progress.
**Consequences:** Reviewers rely on ARCHITECTURE.md for the map until code lands.

## D7 — Local git init now; GitHub push deferred

**Decision:** `git init` and commit locally in Phase 0. Do not create a GitHub repo or
push automatically.
**Reason:** `gh` is unauthenticated and no remote exists. Creating a remote and pushing is
outward-facing and needs the owner's explicit action/login. A local commit still gives the
recoverable checkpoint and a real hash.
**Consequences:** Push is a tracked blocker (see PROGRESS/HANDOFF) resolved by
`gh auth login` or a provided remote URL. *(Resolved 2026-09-09: remote added, pushed.)*

## D8 — Hybrid local perception (DOM + pixels), not DOM-only

**Decision:** EdgeSight perceives through two on-device channels — a DOM/semantic channel
and a visual/pixel channel (screenshot of the visible tab) — merged into one sanitized state.
Phase 1 establishes the **visual input pipeline** (local `captureVisibleTab`); vision ML
(OCR/CV/face) is deferred to Phase 9.
**Reason:** The problem statement is on-device *visual* perception. A DOM-only system would
miss the point and fail to perceive rendered text, canvas/image content, and visual layout.
DOM still earns its place: it makes privacy detection and semantic grounding reliable.
**Alternatives considered:** DOM-only observation; screenshot-only perception.
**Why rejected:** DOM-only isn't "visual perception" and can't read pixels; screenshot-only
throws away the cheap, reliable semantic signal that makes privacy detection accurate.
**Consequences:** We must capture pixels locally now and keep them local (no transmission,
in-memory only). Real visual understanding is future work and must be described honestly as
not-yet-implemented until Phase 9.

## D9 — Observe via programmatic injection (activeTab + scripting), not a persistent content script

**Decision:** Read the DOM by injecting a self-contained function with
`chrome.scripting.executeScript({ func })` on user gesture, authorized by `activeTab`.
No declarative `content_scripts`, no `host_permissions`, no `tabs` permission.
**Reason:** Minimum permissions. A persistent content script needs match patterns / broad
host access; programmatic injection under `activeTab` touches the page only when the user
clicks ANALYZE, and returns its result directly (no extra message plumbing to the page).
**Alternatives considered:** Declarative content script + `tabs.sendMessage`; `<all_urls>` host permission.
**Why rejected:** Both request far more standing access than a click-to-analyze prototype needs.
**Consequences:** The injected function must be fully self-contained (it is serialized and
run in the page, so it can't close over module-scope helpers). `file://` demo pages require
the user to enable "Allow access to file URLs" for the extension (documented in HANDOFF).

## D10 — Measure screenshot dimensions in the service worker; don't ship pixels to the popup

**Decision:** The background worker decodes the capture with `createImageBitmap` to read real
width/height, then drops the image. Only dimensions (not the image) go to the popup.
**Reason:** Keeps the screenshot in memory and local; avoids sending a multi-MB data URL across
the message channel just to prove capture worked. Matches "keep it local, drop when done."
**Alternatives considered:** Send the data URL to the popup and measure with `new Image()`
(also enables a preview).
**Why rejected:** Heavier payload and weaker privacy story for Phase 1. A small preview is an
easy, optional future add if a phase needs it.
**Consequences:** No in-popup screenshot preview in Phase 1 (proof is "Ready" + real resolution).

## D11 — Local visual perception is CORE (Phase 4), not optional future work

**Decision:** Promote on-device visual perception (OCR/CV over the locally-captured screenshot)
from the old "optional Phase 9" to a **core Phase 4**. The roadmap renumbers accordingly:
`2` detection → `3` redaction + guard → **`4` local visual perception (core)** → `5` sanitized
structured UI state (DOM + visual merged) → `6` planner → `7` actions → `8` re-observe + verify →
`9` metrics → `10` polish.
**Reason:** The problem statement (SIH26171) is on-device *visual* perception. Framing vision as
optional undercut the core contribution; it must be first-class and demonstrated, and it naturally
consumes the Phase 1 capture pipeline before the final sanitized state is assembled.
**Alternatives considered:** Keep vision as optional Phase 9; insert vision without renumbering.
**Why rejected:** Optional framing misrepresents the project's core; a non-renumbered insert
collides two phases at the same number.
**Consequences:** Later phase numbers shift by one (planner 5→6, actions 6→7, re-observe 7→8,
metrics 8→9). Visual perception is now on the critical path and must ship with real,
honestly-reported results — no fabricated vision output.

## D12 — Sensitive-field detection classifies SIGNALS, never values

**Decision:** Detection (`extension/src/privacy/detect.js`) is a pure function over structural
signals only — input `type`, `name`/`id`, label text, `autocomplete`. It never reads field values;
the observer never collects them; output per field is exactly `{ id, role, sensitive, label }`.
**Reason:** The core principle is that raw values must never leave the browser. Classifying on
signals (not values) means values are never touched during detection — a provable "no raw PII in
the outgoing metadata" guarantee (see the serialization/leak test in TESTING).
**Alternatives considered:** Value-based pattern matching (regex over field contents) to detect PII.
**Why rejected:** Reading values to classify them creates exactly the exposure we forbid and risks
logging/serializing PII. Signal-based classification is safer and sufficient for form fields.
**Consequences:** Detection is conservative and form-oriented. Value-shaped detection (e.g. a raw
email typed into a generic box) is out of scope for now; revisit only if a phase needs it, and only
via on-device handling that still never transmits the value.

## D13 — DOM-assisted deterministic visual redaction (Phase 3)

Use visible field getBoundingClientRect boxes to black-mask the full field region with
local Canvas. No OCR/CV/model is involved. Phase 4 remains actual perception over pixels.
Map viewport CSS pixels using actual screenshotWidth/viewportWidth and
screenshotHeight/viewportHeight; round outward and clamp to image bounds. Invalid
geometry blocks. HiDPI must never assume CSS pixels equal screenshot pixels.

## D14 — Keep Phase 2 value-free; separate short-lived local raw handling

The classifier remains unchanged and the observer never reads values. A separate
privacy collector temporarily reads values inside the trusted browser and returns
them only to the worker for semantic sanitization, capture stability and guard work.
No raw field-value strings go to popup/logs/errors/files/storage/network. Finally
cleanup drops references and clears temporary element maps. JS garbage collection
cannot guarantee secure memory erasure. Known sensitive values repeated in visible
body text/title block because field-region masks cannot cover those copies.

## D15 — Separate raw pixels, local previews and sanitized-image capabilities

Raw screenshot PNG stays in the worker/redaction call and never enters the future
package builder. Only successful Canvas redaction can mint a private WeakMap handle;
raw strings and forged handles are rejected. buildOutboundPackage lives with that
private registry, always invokes the guard and returns a cloned/frozen safeContext.
Future Phase 6 transport must consume only safeContext, never the full analysis
response. Extension CSP blocks connections now; no transport exists.

This supersedes D10's Phase 1 no-preview choice: Phase 3 explicitly requires a local
comparison. ORIGINAL — LOCAL ONLY is a separate password-masked preview (even a
revealed password is hidden), outside the outbound package. SANITIZED — SAFE CONTEXT
is scoped to detected visible DOM fields. Both previews expire after 60 seconds or
clear on re-analysis/close. There is no persistence or transmission.

## D16 — All source text is untrusted until sanitized

Phase 2 labels help local classification but are not privacy-certified by textContent
rendering. Phase 3 omits DOM labels/titles/arbitrary strings from the semantic package;
uses fixed roles/placeholders; and withholds unknown non-sensitive values. A narrow
demo allowlist retains Bengaluru and known Purpose choices only. The guard recursively
checks keys/values against exact known sensitive strings, blocks unsupported structures,
and never identifies the offending value. New goals/action labels must use this same
layer in later phases. Unknown or transformed PII is not solved by exact-value matching.

## D17 — Fail closed, with honest prototype limits

Check active tab, document identity and before/after geometry/values; reject changes,
unsupported pinch zoom, invalid masks, capture/decode failure and guard contamination.
These checks do not make DOM/capture atomic. No masks for unknown PII in arbitrary
pixels, images/canvas/iframes/shadow DOM are claimed. Phase 3 is the static demo's
privacy filter; Phase 4 remains the core perception phase. Node doubles prove code
paths, not real browser pixels. Chrome visual/manual checks remain UNVERIFIED.

## D18 — One lightweight local OCR baseline for the deadline

Select Tesseract.js 6.0.1 with compatible core 6.1.2 and English data 1.0.0. Installed
package source was inspected for exact filenames, OEM selection, blocks output, cache
behavior and worker paths. Use English LSTM-only and sparse-text PSM=11. This is honestly
called a browser-local OCR/CV perception baseline, not a Vision Transformer. Large ViT,
OmniParser, cloud VLM, ONNX and extra frameworks add deadline risk and are excluded.
A future quantized model can implement the same image-in/normalized-items-out interface.

## D19 — Commit a reproducible extension-local runtime

Copy explicit pinned assets into extension/vendor/ocr and verify their hashes. Include
runtime, worker, both LSTM SIMD/non-SIMD embedded-WASM cores, English data and licenses.
Installed core 6.1.2 `.wasm.js` files contain their WASM bytes, not external binary links.
Override all remote defaults with local URLs; workerBlobURL=false; cacheMethod=none.
Do not commit node_modules, source maps, caches or test PNGs. Full asset/license provenance
is in vendor/ocr/README.md, including npm English MIT metadata versus Apache upstream data.

## D20 — Offscreen host and minimum MV3 policy adjustment

Add offscreen permission and Chrome 116 minimum for runtime.getContexts. The offscreen
page owns the local Web Worker and survives popup close. CSP adds wasm-unsafe-eval and
worker-src self, and changes connect-src none to self + data: for local language and embedded-WASM reads. It never
allows external origins, unsafe-eval or blob workers. This supersedes Phase 3's strict
connect-src none without introducing an outbound transport. Runtime asset reads can appear
in DevTools as chrome-extension URLs; external model/CDN requests must remain zero.

Inspection of core 6.1.2 also found its loader first uses fetch on the embedded WASM
data URI before a byte-decoding fallback. The data: connection allowance avoids a CSP
failure on that local in-memory read; it grants no remote origin access.

## D21 — Sanitized pixels first; untrusted OCR output second

The OCR application entry accepts only the Phase 3 sanitized-image capability. It forwards
only PNG bytes/dimensions, never DOM labels/values. Post-inference output is guarded against
locally held known values before and after normalization; canonical comparison also handles
case and whitespace/punctuation changes. Conservative output vocabulary withholds unknown
lines and never inserts text. Unsafe OCR revokes the whole candidate image package/previews;
ordinary OCR errors keep Phase 1–3 results. Phase 5 fusion is deliberately not implemented.

## D22 — Measured timing, bounded work and honest evidence

Record actual initialization/inference/total times, distinguish cold from warm, dispose
worker after 120 seconds idle and close its host after a 45-second processing deadline.
No resizing until demonstrated necessary; cap OCR at 20 MP and retain original pixel boxes.
Return actual engine confidence divided by 100, or null if unavailable. Node/WASM synthetic
inference is real engine evidence but not Chrome evidence. All manual P4 checks stay
UNVERIFIED until the user actually reports them; no browser latency is fabricated.
