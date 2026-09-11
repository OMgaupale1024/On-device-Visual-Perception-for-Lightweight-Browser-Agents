# EdgeSight — Decisions

Chronological record of significant technical decisions.

Current Phase 6B policy is D31–D33 below, extending D28–D30. Earlier phase-local statements such as
"no transport" are historical; D28 supersedes the old D2 planner-mode scaffold,
D5 broader action list, and D9/D20 network permission scope for this checkpoint.

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

## D21 — Sanitized pixels first; untrusted OCR output second (superseded by D23)

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

## D23 — Raw pixels are permitted inside the trusted local OCR boundary

The revised Phase 4 instruction supersedes D21's sanitized-input-only policy. Captured
raw PNG pixels may reach the extension-local OCR worker; raw OCR remains local and is
never sent to the popup, logs, files or an outbound package. Phase 3 still independently
produces the sanitized image through its unchanged private handle/builder boundary.
The existing Tesseract.js 6.0.1 / core 6.1.2 / English 1.0.0 assets and CSP are retained.

Map sensitive CSS rectangles with the existing Phase 3 scaling function. After inference,
omit any OCR line intersecting a sensitive image rectangle (2-pixel safety padding).
Also omit known sensitive values and conservative email/phone/employee-ID patterns.
Release other actual OCR text, not a fixed UI vocabulary. Apply the recursive guard to
the final safe representation, plus canonical matching across retained text. A residual
leak blocks output without identifying offending text. Keep observation-scoped IDs,
screenshot-pixel boxes and real confidence divided by 100 for future Phase 5 consumption.

Clear the worker's in-memory raw input file and replace the engine's retained raster
with a tiny blank image after each inference; keep one initialized language/worker for
warm runs. Reference cleanup is not secure memory zeroization. Chrome checks remain
UNVERIFIED until confirmed; do not turn Node or mocked tests into browser evidence.

## D24 — Bound service-worker activity to the local OCR transaction

Chrome normally stops an inactive service worker after 30 seconds, shorter than the
45-second OCR budget. Its documented Chrome 110+ extension-API activity resets that
idle timer. Call local getContexts every 10 seconds only while waiting for OCR, and
clear the interval in finally on success, failure or timeout. No network, storage or
permanent keepalive is introduced. Chrome 116 remains the minimum supported version.
See [Chrome lifecycle documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

## D25 — Privacy-safe OCR diagnostics through one audited logging sink

**Problem:** Phase 4 OCR worked in Node/WASM but failed in real Chrome
("Local OCR unavailable or timed out"). The real browser exception was unknowable because
five catch layers swallowed it: `ocr.js` rethrew a generic string (and `createWorker` was
outside its try entirely), `offscreen.js` sent bare `{ ok: false }`, `bridge.js` and
`pipeline.js` collapsed everything to a generic message, and a no-`console` invariant
(D14/background test) forbade logging. Static review found every checkable cause correct
(asset URLs resolve, worker strips trailing slashes, workerBlobURL=false, CSP grants
wasm-unsafe-eval + connect-src 'self'), so the fault is runtime-only and needs live evidence.

**Decision:** Add stage-tagged diagnostics that expose the failing stage and error class in
the offscreen and service-worker consoles, without weakening privacy. All logging is
centralized in one audited sink, `extension/src/perception/diagnostics.js`; every other
source file remains log-free. The sink emits ONLY `{stage, error name, truncated message}`
— never screenshot pixels, recognized text, field values or known secrets. `createWorker`
is now wrapped so init failures surface; Tesseract's own progress logger maps to the stage
taxonomy (OCR_CORE_LOAD / OCR_LANGUAGE_LOAD / OCR_INIT / OCR_RECOGNIZE); a timeout logs
OCR_TIMEOUT distinctly from an immediate fault. The popup keeps its generic user message.

**Invariant change:** The "no `console.` anywhere in src" rule (background test) is relaxed
to "no `console.` outside the single diagnostics sink." Persistence (`chrome.storage`,
`localStorage`, `indexedDB`) and network transport remain forbidden in every file, including
the sink. A regression test asserts a host failure surfaces a stage-tagged diagnostic while
the thrown user-facing error stays generic.

**This is diagnosis, not a fix.** No root-cause code change was made; the actual Chrome fault
is still UNVERIFIED and will be fixed once the next Chrome run reports the failing stage.

## D26 — Import the vendored Tesseract runtime by its actual (default-only) export

**Root cause (identified from the Chrome run):** the browser threw, before any OCR code ran,
`Uncaught SyntaxError: The requested module '../../vendor/ocr/tesseract.esm.min.js' does not
provide an export named 'createWorker'`. `ocr.js` used a NAMED import,
`import { createWorker } from '.../tesseract.esm.min.js'`, but the vendored Tesseract.js 6.0.1
browser bundle exposes only a default export (`export { tesseract_min as default }`);
`createWorker` is a property of that default object, not a named export. Named-import binding
is resolved during ESM *linking*, before evaluation — so the module never executed and the
D25 stage diagnostics never ran (they instrument runtime failures; this preceded runtime).
The earlier "Node worker path vs Chrome Web Worker/WASM/CSP" hypothesis was WRONG: Node
"passed" only because no Node test ever linked the browser bundle — `smoke-ocr.mjs` imports
`createWorker` from the `tesseract.js` PACKAGE (its Node build has the named export) and
`perception.test.mjs` reads `ocr.js` as text. Nothing to do with worker_threads, WASM or CSP.

**Decision:** import the vendored bundle by its real contract —
`import Tesseract from '.../tesseract.esm.min.js'; const { createWorker } = Tesseract;`. No
change to the engine, version, worker/core/lang paths, timeout, CSP or offscreen lifecycle;
those were already correct. Do not add a wrapper module to fake a named export — that would
hide the real contract from the next maintainer.

**Regression guard:** `extension/tests/ocr-import.test.mjs` links the vendored bundle the way
Chrome does (ESM linking is spec-defined, so Node reproduces it) and asserts (1) the bundle
exports only `default` with a callable `createWorker` on it and no named `createWorker`, and
(2) importing `ocr.js` does not throw the "does not provide an export named" SyntaxError. The
bundle references `self` at evaluation time, so the test shims `globalThis.self` to inspect
the evaluated exports. LIMIT: this proves the import/export CONTRACT, not full Chrome
WASM/worker execution — the user still smoke-tests Chrome. Not yet marked PASSED in Chrome.

## D27 — Canonical SafeAgentContext fuses safe DOM + safe visual state (Phase 5)

**Problem:** Phases 2–4 produce two separate safe structures — sanitized semantic fields
(`sanitizeSemantics`) and sanitized visual OCR items (`sanitizeVisual`) — plus a sanitized
image behind a handle. Phase 6 transport needs ONE stable, privacy-guarded interface to
consume, not an ad-hoc concatenation of internal objects, and it must never be able to reach
raw pixels, raw OCR or raw field values.

**Decision:** add `extension/src/privacy/agent-context.js` exporting `buildSafeAgentContext`,
`serializeSafeAgentContext` and `validateGoal`. It consumes ONLY already-safe inputs (§9 of
the Phase 5 brief) and re-copies whitelisted keys (never spreads) so no stray/internal key
rides along. The schema (schemaVersion 1): `observation {id, capturedAt, viewport, image,
coordinateSystem}`, `goal`, `privacy {status, sensitiveFieldCount, redactedRegionCount,
rawPiiIncluded:false}`, `fields[]` (each tagged `source:"semantic"`), `visualElements[]`
(each tagged `source:"visual"`, keeping the observation-scoped `visual_N` id + pixel bbox +
confidence), and `redactionScheme` (present placeholders → fixed descriptions, no values).

**Key sub-decisions:**
- **Image is metadata only.** The context carries `{width,height,redactedRegions}`, never the
  sanitized `dataUrl`. The sanitized bytes stay behind the existing `redact.js` WeakMap handle
  so a future network layer obtains only the sanitized representation, deliberately, via that
  separate path. `buildOutboundPackage` (which does inline the sanitized dataUrl) is retained
  ONLY as the local preview package + future "obtain sanitized image" path, not the context.
- **Provenance is never conflated (§12).** DOM-derived fields and pixel-derived visual
  elements stay in separate arrays with explicit `source` tags; DOM text is never presented as
  visually recognized.
- **Final local gate, fail closed.** The builder runs `checkOutbound` (structural, nested,
  cycle-safe, keys+values) AND scans the exact serialized bytes for any known sensitive value.
  Either hit ⇒ `{status:"BLOCKED"}` with a GENERIC reason (never echoes the value). Structural
  malformation throws; contamination fails closed. Serialized byte size is reported for future
  efficiency evaluation (Phase 9); a representative 7-field/6-visual demo is ~2.2 KB.
- **Goal is untrusted text (§16):** coerced to string, whitespace-collapsed, trimmed, capped at
  500 chars, stored only — never executed/interpreted.
- **`visualRefs` (optional semantic↔visual links, §13) deferred.** It needs cross-coordinate-
  space (CSS field rects vs screenshot-pixel boxes) matching; the schema stays forward-
  compatible (add an optional field later) rather than shipping fragile matching now.

**No network/server/LLM/actions** are introduced. Phase 6 transport, when it exists, must
consume `agentContext` only, and obtain the sanitized image solely through the handle path.

## D28 — Phase 6A structured-only transport with private context approval

The user confirmed the current Chrome flow works and explicitly authorized Phase 6A.
Only that general report is recorded; detailed unreported manual checks stay pending.
Inspected/synchronized baseline: ae4e37e. Design is in PHASE_6A_PLAN.md.

The existing final local known-value guard remains primary. After it passes, the
Phase 5 builder freezes the context and records identity → exact safe JSON in a
private WeakMap. The transport preparation function verifies that immutable approval
at send time. No registration/cast API and no retained secret list. The service worker
clears known values before requestPlan(agent.context). Transport imports only approval
and config; raw OCR/images/DOM/local envelopes are not normal inputs. Clones and all
20 requested contaminated candidates fail before fetch.

Send readable structured JSON only. Although the Phase 3 image accessor is safe by
capability, actual image transfer adds another schema/size/pixel-validation path and
is unnecessary for the deterministic planner. Defer upload to Phase 6B; preserve the
private handle as the sole future sanitized-image source. Never substitute raw pixels.

## D29 — Minimal localhost server, strict validation and explicit dev origin

FastAPI/Pydantic/Uvicorn, no model/framework/provider/persistence. Strict nested models
reject unexpected keys, invalid types/IDs/geometry/confidence, policy and summary
inconsistency. Null confidence preserves Phase 5's unknown-confidence representation.
Server canary/pattern checks provide defence in depth. Custom 422 errors omit rejected
input rather than exposing FastAPI's default input-bearing validation errors.

One configured exact Chrome extension origin; no wildcard/credentials; supplied
disallowed origins are blocked before planning. Requests without Origin support local
clients; CORS is not authentication. Bind 127.0.0.1 only. Loopback host permission is
needed for cross-origin extension fetch; port 8000 is restricted by connect-src CSP.
Self/data local OCR access and existing script/WASM/worker policy remain intact.

The transport has one configured URL, no credentials/cache/referrer, redirects disabled,
and a five-second deadline including body parsing. Opening the popup sends nothing;
Analyze / Plan explicitly initiates it. Offline/timeouts/5xx yield unavailable,
4xx/malformed responses yield rejected, preserving the local results.

## D30 — Deterministic, observation-bound suggestions only

This checkpoint supports only CLICK and STOP (superseding the broader historical D5
action list for Phase 6A). Match the normalized travel demo goal, require exactly one
filled non-withheld field per required role, and exactly one visual text equal to
Continue after trim/case folding. Return its supplied ID or STOP/null. Always echo
the submitted observation ID; never return selectors, code or arbitrary coordinates.

Client rejects wrong versions/keys/actions/types, stale observation IDs and missing/
unknown/ambiguous targets. Popup displays local safe target text and suggestion-only
wording; arbitrary server reasons are not rendered. There is no execution or later
live-page freshness guarantee. Real model integration is Phase 6B; execution is Phase 7;
re-observation is Phase 8. Stop after Phase 6A commit/push and await review.

## D31 — One LLM over sanitized structured visual context (provider superseded by D33)

> **Superseded by [D33](#d33--switch-real-provider-to-nvidia-nim).** The single-LLM,
> minimized-input, strict-output design below still holds; only the concrete provider
> (originally OpenAI Responses / gpt-4.1-mini) changed to NVIDIA NIM. The OpenAI
> adapter was never verified against a real key.


The user confirmed Phase 6A's actual Chrome POST /plan → FastAPI HTTP 200, seven
fields, five sensitive/redacted regions, safe/false-PII flags, placeholders, retained
Bengaluru/Conference and working deterministic flow. Proceed only with Phase 6B.

Presence-only local configuration checks found no provider key variables and no
root/server .env. No values were read/displayed. No provisioning tool was available.
Implement OpenAI Responses with pinned gpt-4.1-mini-2025-04-14. It fits this small
instruction-following/ID-selection task and supports strict structured output without
a separate reasoning stage. Use existing httpx as a production dependency, no SDK,
agent framework, provider chain or model router. Real-key verification remains pending.

This is an LLM over sanitized structured visual context, not a VLM. No image upload;
the existing private sanitized-image capability remains unchanged. Fixed provider URL,
store=false, no tools/history/retries/redirects/environment proxies. Server-side key
only, never prompt/browser/logs. Official references:
[model](https://developers.openai.com/api/docs/models/gpt-4.1-mini),
[structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## D32 — Minimized provider input and untrusted output

Revalidate the entire JSON candidate before explicit projection, including unknown
nested fields. Keep only goal, safe privacy flags, semantic state and pixel-derived
visual state with clear provenance, plus legend. Omit observation IDs, timestamps,
bboxes, dimensions, field IDs and internal metadata. Scan exact projected JSON and
cap at 32KB without truncation. Both direct AI-entry and /plan contamination matrices
must prove zero provider calls.

One fixed system prompt; user goal and screen content stay separate as observational
JSON. Placeholder values must never be inferred, and only filled=true means filled.
Model returns exactly action/target/reason. Use four fixed safe reason phrases to
prevent free-form private/executable explanations; no chain-of-thought. Strict local
output validation rejects duplicates, unsafe keys/actions/targets, code/coordinates,
refusals and malformed output without repair. Server owns observation binding.
Prompt policy does not guarantee correct semantic choices; execution remains future.

## D33 — Explicit modes with unchanged action contract

Preserve original deterministic planner as default. PLANNER_MODE=ai selects the
single real adapter; failures never trigger deterministic fallback. Keep the exact
Phase 6A request and five-key response JSON. Expose mode through X-EdgeSight-Planner,
allowlisted in the extension and shown as AI/Deterministic/Unknown, also on failures.

Provider work is bounded to 15s/64KB; browser request timeout increases to 20s, with
the existing final privacy gate intact. Missing key/network/status errors return
generic 503, timeout 504, malformed/refused/unsafe model output 502, bad input 422.
No provider body/headers/errors logged. No new metrics UI. Local results remain visible.

Phase 6B automated acceptance and real-key manual acceptance are separate. Stop after
commit/push for review. Next task: Phase 7 safe execution using the current
observation's visual boxes. No Phase 7 code in this checkpoint.

## D33 — Switch real provider to NVIDIA NIM

The OpenAI Responses adapter (D31) was never verified against a real key. NVIDIA API
access is now verified: nvidia/nemotron-3.5-lightning-30b-a3b at
https://integrate.api.nvidia.com/v1 returns the exact structured JSON EdgeSight needs
(action/target/reason). Replace the single real provider with NVIDIA NIM and keep every
privacy, validation, transport and safety invariant from D31–D32.

NVIDIA NIM is OpenAI-compatible **Chat Completions** (/chat/completions), not the
Responses API. The adapter (renamed app/nvidia_provider.py) therefore sends
`messages` + `response_format={"type":"json_object"}`, temperature=0, stream=false,
256 max_tokens, and `chat_template_kwargs.enable_thinking=false` so the model returns
a short decision, not chain-of-thought; it parses `choices[0].message.content` and
rejects refusals, tool calls and empty/multiple choices. httpx remains the transport
and doubles as the OpenAI-compatible HTTP client — the Python `openai` SDK is **not**
added, which also preserves the existing httpx.MockTransport test seam. Credential is
now `NVIDIA_API_KEY`; `NVIDIA_BASE_URL` and `NVIDIA_MODEL` are non-secret overrides.

Trade-off: json_object mode does not enforce the reason enum on the provider, so the
server's strict `ModelDecision` validation (fixed reason phrases, target membership)
is the only guarantee — an off-enum but valid-JSON reason yields a 502 by design, no
repair, no fallback to deterministic. Only ONE real provider exists (NVIDIA); the
OpenAI path is fully removed from the application layer. No screenshots are sent to
NVIDIA in Phase 6B: this remains an LLM over sanitized structured visual context, not
a VLM. Real server-side smoke and Chrome AI-mode acceptance are still pending (no key
configured this session).

## D34 — Safe, visually grounded browser execution (Phase 7)

The planner already returns a validated `CLICK visual_N` / `STOP`. Phase 7 executes it
with a strict split of authority: the SERVER chooses WHAT to click; the BROWSER decides
WHERE and HOW, entirely locally. The server may never supply a selector, XPath,
JavaScript, DOM query, coordinates, element HTML, URL or command — the browser already
holds `visual_N`'s geometry from local pixel perception.

Implementation is two small modules, not an automation framework. `actions/geometry.js`
is pure math: it converts the LOCAL screenshot-pixel bbox center to a CSS viewport point
(`scaleX = viewport.width / screenshot.width` per axis; no `devicePixelRatio === 1`
assumption, since captureVisibleTab images are at the device ratio) and rejects invalid
or out-of-viewport geometry. `actions/execute-click.js` holds the execution policy and
the injected page function. A LOCAL, single-use execution ticket binds the action to the
observation id, target visual id, tab id, window id and document id; it is never sent to
NVIDIA or FastAPI and never persisted. `ticketForPlan` refuses to mint unless the plan's
observationId matches the local context and the target exists in `visualElements`
(defence in depth beyond the transport validator).

`executeTicket` fails closed on a spent/absent ticket, a >60s-old observation (aligned
with the popup's local-preview lifetime), a missing/inactive/other tab, a navigated URL,
bad geometry, or a target overlapping a redacted sensitive region. It consumes the ticket
before dispatching exactly one `chrome.scripting.executeScript` pinned to the observed
documentId. The injected `clickInPage` re-checks the viewport, runs
`document.elementFromPoint`, walks up to a supported control (`button`,
`input[type=button|submit]`, `[role=button]` — no generic clickable rule), validates it
(connected, enabled, visible, non-zero rect containing the point, not covered, text-
consistent with the OCR target) and performs one `element.click()`. No
eval/Function/CDP/Playwright/selector injection; DOM text is only an execution-safety
signal, never treated as visual evidence.

Trade-offs and boundaries: execution is gated behind an explicit `EXECUTE SUGGESTED
ACTION` button (Phase 7 introduces side effects; silent auto-click after an AI response
is avoided). Single-use + new-analysis invalidation prevent replay. Phase 7 performs NO
re-observation and makes NO success claim — the UI reports "CLICK DISPATCHED" only; goal
verification is Phase 8. Scope is one guarded click on a button-like target: no typing,
navigation, scroll, downloads or multi-step actions. Ticket state lives in the service
worker; a worker teardown drops it, which is a safe fail-closed (re-analyze). Automated
tests cover geometry, binding, policy, replay and element safety; the manual Chrome
click demo (positive and stale/wrong-page negative) is pending.

## D35 - Fresh browser-local visual outcome verification (Phase 8, 2026-09-11)

A click acknowledgement cannot prove success. After Phase 7 EXECUTED, automatically
observe again locally, then match only fresh safe pixel OCR. Extract the smallest shared
Phase 1-5 transaction into background/local-observation.js so analysis and verification
share capture, privacy, OCR, safe conversion and cleanup. Keep requestPlan and ticket
creation exclusively in the analysis orchestrator. No provider/server request during
verification, no recovery click or automatic replanning.

Choose one attempt after 750 ms because the travel demo reveals success synchronously.
Avoid speculative retry complexity; a slow transition produces NOT VERIFIED / Analyze
again. Preserve the 45-second OCR bound; add five-second local API/redaction awaits and
a 60-second verification deadline with abort/late-result rejection. No Phase 9 charts.

Execution remains pinned to the old document. Verification instead requires the same
intended active tab/window and explicitly permits a new URL/document. Pin consistency
only within the new capture. Fresh UUID/timestamp/dimensions/OCR/visual IDs are mandatory;
old observation identity or pre-dispatch capturedAt cannot pass. Tab checks before/after
capture and after perception fail closed, but are not an atomic capture guarantee.

Use a narrow fixed local spec: VISUAL_TEXT / Travel Request Submitted. Require the full
phrase with word boundaries after NFKC/lowercase/whitespace/punctuation-spacing
normalization; punctuation itself remains. No fuzzy OCR spell correction, isolated
request/submitted, optional supporting phrase requirement or generic workflow language.
Sort by bbox row then x; join at most three spatially adjacent fragments with explicit
height-relative gap limits. Record contributing OCR confidence (0-1 or null), no
uncalibrated minimum threshold or invented aggregate. Threshold tuning belongs to Phase 9.

Reuse the builder's private immutable approval as proof of the final privacy gate.
verify-visual-result.js matches only source=visual elements, never DOM fields or
planner/server text. Return known expected text, observation IDs, contributing IDs/
confidence, status/reason, actual privacy and timings only. Post-action previews/images,
raw OCR/DOM/private values never reach popup results. No new storage or permissions.

Show CLICK DISPATCHED -> VERIFYING -> VISUALLY VERIFIED / NOT VERIFIED automatically
after explicit Execute. Retain safe result metadata only in worker memory so reopening
the popup can display it; reset on new analysis, lose it on worker teardown. Reject
concurrent Analyze/Execute. No end-to-end manual success claim until Chrome observes
fresh OCR evidence. Current manual checks remain PENDING due to the Computer Use URL
policy-enforcement stop; all automated tests passing is a separate code-complete claim.

## Phase 9 - honest controlled evaluation (2026-09-11)

Map results to the supplied SIH weights: visual context 25%, PII precision/recall 20%,
redaction precision 20%, client resources 20%, end-to-end latency 15%. Do not invent a
weighted score: the rubric provides no conversion from durations/bytes to points.

Keep five generated fake PNGs and independent labels. Recognition must execute real
pixel OCR. Score exact normalized whole-line items, one-to-one, without fuzzy matching
or joining; preserve misses and unexpected detections. This evaluates safe OCR text,
not all visual context, and does not justify calibrating OCR confidence thresholds.

Use forty deliberately mixed field signals with the real detector, including
unsupported aliases and misleading safe negatives. Retain five false negatives and
six false positives. Do not tune Phases 0-8 to make Phase 9 numbers look better.
For redaction, use actual emitted final mask commands and independent geometry,
greedy one-to-one IoU >=0.5. Any positive overlap damages a safe region. This coarse
region metric is feasible without heavy CV dependencies but does not prove native
Chrome opacity or full sensitive-pixel coverage. Document the adapter explicitly.

Two worker-cold OCR runs and five warm runs remain separate. Cheap stages repeat ten
times (three redaction layouts yield thirty adapter timings). Keep all samples,
including HTTP outliers/failures. Report count/min/median/mean/max; nearest-rank p95
only at n>=20, without significance claims. Do not combine Node OCR/adapter/Python
timings into a fictional Chrome end-to-end result. Asset disk size is not runtime RAM.

Measure real browser processing at existing call boundaries, with performance.now;
Python uses perf_counter. Separate human confirmation from plan + post-execution
machine total. Keep numeric timing siblings local and preserve the provider/context
contract. Server exposes only fixed numeric timing headers. Popup starts at --,
never fake percentages; no dashboard/library/provider expansion.

Default benchmark uses temporary deterministic loopback HTTP and no external provider.
Opt-in AI requests use the existing safe fixture and server credential only. No key
was configured here, so NVIDIA and live Chrome performance stay PENDING. JSON output
contains aggregate metadata/numbers, no raw OCR/private screenshot/credential. Commit
small reviewed synthetic fixtures/reference results; keep routine output ignored.
Record precommit revision/dirty state plus source digest rather than fabricate a
commit hash before it exists. Exact next task is Phase 10, not implemented here.
