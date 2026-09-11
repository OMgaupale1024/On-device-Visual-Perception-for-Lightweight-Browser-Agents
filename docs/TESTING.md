# EdgeSight — Testing

Test log. One row per check. Do not claim something works without testing it.
Historical phase checks are retained below. The latest Phase 6A checkpoint and manual
procedure follow; the latest Phase 6B evidence is at the end. Old "no transport" and awaiting-reload statements describe
their historical phase. The user now confirms the current Chrome flow works, without
individually confirming every detailed historical check.

## Phase 0 — foundation verification

| # | Test | Purpose | Input | Expected | Actual | Result |
|---|------|---------|-------|----------|--------|--------|
| 0.1 | Git available | Can we version-control | `git --version` | git present | git 2.51.0.windows.2 | PASS |
| 0.2 | Node available | For extension tooling later | `node --version` | Node present | v24.11.0 | PASS |
| 0.3 | Python available | For planner server later | `python --version` | Python 3.10+ | 3.10.11 | PASS |
| 0.4 | gh CLI available | For GitHub push | `gh --version` | gh present | 2.97.0 | PASS |
| 0.5 | gh authenticated | Needed to push | `gh auth status` | logged in | NOT logged in | FAIL (blocker) |
| 0.6 | Repo init | Establish `main` | `git init -b main` | repo on `main` | initialized, on `main` | PASS |
| 0.7 | `.remember/` ignored | Keep harness tooling out of repo | `git status` | `.remember/` not listed | not listed | PASS |

## Known limitations (Phase 0)

- No runtime/application tests yet — nothing executable exists beyond the scaffold.
- Push to GitHub not verified: blocked on `gh` authentication / missing remote (test 0.5).

## Phase 1 — extension, demo page, visual capture (2026-09-10)

Verified in a real browser via Chrome automation against the demo page, served locally on
`127.0.0.1:8137` **for the test only** (a throwaway static server — not part of EdgeSight,
not committed). Test 1.4–1.9 ran the **exact** observer code from
`extension/src/content/observe.js`.

| # | Test | Purpose | Input | Expected | Actual | Result |
|---|------|---------|-------|----------|--------|--------|
| 1.1 | manifest valid JSON | loads without parse error | `manifest.json` | parses | parsed OK | PASS |
| 1.2 | JS modules parse | no syntax errors | 4 ESM files | `node --check` clean | all clean | PASS |
| 1.3 | demo renders | believable form | open demo page | form visible, title set | rendered, title "Employee Travel Request" | PASS |
| 1.4 | observer inputs | count visible inputs | demo DOM | 7 | 7 | PASS |
| 1.5 | observer buttons | count visible buttons | demo DOM | 1 | 1 | PASS |
| 1.6 | observer labels | count visible labels | demo DOM | 7 | 7 | PASS |
| 1.7 | field semantics | correct input types | demo DOM | email=email, phone=tel, 1 password field | confirmed (password introspection is harness-redacted; count===1 proven via passing conjunct) | PASS |
| 1.8 | purpose default | select default value | demo DOM | "Conference" | "Conference" | PASS |
| 1.9 | Continue → success | observable "after" state | click Continue | form hidden, success shown, title="Travel Request Submitted" | all true | PASS |

### Requires MANUAL verification (cannot be automated here)

The extension load + popup + `captureVisibleTab` cannot be driven by the automation harness
(chrome://extensions is restricted, loading unpacked needs a native file dialog, and the
harness blocks `file://` navigation). Verify by hand:

| # | Manual test | Expected | Status |
|---|-------------|----------|--------|
| M1 | Extension loads (chrome://extensions → Developer mode → Load unpacked → `extension/`) | loads, no manifest errors | ✅ Verified 2026-09-10 (by user) |
| M2 | Popup opens (click toolbar icon) | title, goal box, ANALYZE PAGE, "Ready" | ✅ Verified 2026-09-10 (by user) |
| M3 | Analyze demo (ANALYZE PAGE on demo page) | element counts returned and displayed | ✅ Verified 2026-09-10 (by user) |
| M4 | Visual capture (same run) | Screen capture: Ready; real resolution shown | ✅ Verified 2026-09-10 (by user) |
| M5 | No network (DevTools → Network during a run) | zero requests from EdgeSight | ⏳ Not yet verified |
| M6 | Restricted page (ANALYZE on a chrome:// page) | graceful error, no crash | ⏳ Not yet verified |
| M7 | Re-run (click ANALYZE twice) | second run works, state not broken | ⏳ Not yet verified |
| M8 | file:// access toggle (if M3 errors, enable "Allow access to file URLs", retry) | analysis works | ⏳ Not yet verified |

> Recorded honestly: the user confirmed M1–M4 (loads, popup, analyze returns counts, capture
> Ready + real resolution). M5–M8 were not reported, so they remain unverified — not claimed.

> M4 note: `captureVisibleTab` returns **device-pixel** dimensions of the visible viewport, so
> on a HiDPI display they exceed CSS `innerWidth/innerHeight` (the test machine reported a
> 2519×1245 CSS viewport). Both are real measurements, not hardcoded.

## Phase 2 — local sensitive-data detection (2026-09-10)

Detection is pure (`extension/src/privacy/detect.js`), so it is unit-tested in Node with no
browser, plus a live-DOM run of the full observe→detect pipeline on the demo page.

### Node unit tests — `node extension/tests/detect.test.mjs` (7/7 PASS)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 2.1 | demo roles | name / email / phone / employee_id / other / other / password | PASS |
| 2.2 | sensitive total | exactly 5 (name, email, phone, password, employee_id) | PASS |
| 2.3 | false positives | username, nickname, file name, screen name, destination, purpose, company, search → other | PASS |
| 2.4 | name variants | "Full Name" / "First Name" / "Name" / autocomplete given-name → name | PASS |
| 2.5 | ignores values | a field whose *value* looks like PII stays "other" (classifies signals, not values) | PASS |
| 2.6 | serialization / leak | with raw values injected onto signals, output JSON contains none of them; keys = {id,label,role,sensitive} | PASS |
| 2.7 | empty input | `undefined` / `[]` / `{}` handled | PASS |

### Live demo DOM (Chrome automation; exact observe+detect logic on the local demo)

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 2.8 | field signals | 7 | 7 | PASS |
| 2.9 | roles | field_1..7 = name, email, phone, employee_id, other, other, password | same | PASS |
| 2.10 | sensitive count | 5 | 5 | PASS |
| 2.11 | output keys | only {id, role, sensitive, label} | true | PASS |
| 2.12 | no value leak | none of the actual page values appear in output | 0 leaked (7 values checked) | PASS |

> The leak check read the 7 real field values **inside the page** (including the password) and
> confirmed none appear in the classified output; the values themselves were never returned.


## Phase 2 technical review and manual status

Phase 2 passed technical review (user instruction, 2026-09-10). This is not a manual
popup confirmation. Phase 2 popup sensitive checklist, count = 5 and Destination/Purpose
non-sensitive display remain **UNVERIFIED** by the user. No new manual pass is recorded.
Historic Phase 1 M1–M4 confirmations above are preserved; M5–M8 remain pending.

## Phase 3 automated verification (2026-09-10)

Run `node --test extension/tests/*.test.mjs` (Node 24, no dependencies/server/network).
The legacy detector file contains 7 assertions and is reported as one Node test entry.
Result: **31/31 Node test entries PASS**, including the unchanged detector file's
**7/7 legacy tests**. All extension JS/MJS syntax checks and `git diff --check` PASS.
No automated browser or manual visual pass is included in these counts.

| Coverage | Evidence |
|---|---|
| CSS/screenshot scaling | 1x, 2x HiDPI, independent axis ratios |
| Mask geometry | outward rounding, all-edge clipping, offscreen/null, invalid/zero sizes |
| Demo selection | five sensitive roles selected; Destination/Purpose excluded |
| Semantics | five placeholders, filled/empty booleans, no raw values, demo safe values |
| Untrusted strings | labels omitted; unknown values withheld; invalid IDs blocked |
| Guard | sanitized payload accepted; name/email/phone/employee ID/password contamination blocked |
| Deep guard | nested objects/arrays, keys, numeric phone, empty secrets, cycles/accessors/custom types |
| Error privacy | no offending value in guard or worker failures |
| Image boundary | raw PNG and forged handles rejected; snapshot/frozen package prevents later mutation |
| Canvas API double | full black fill calls, password original mask, region count and resource closure |
| Worker API doubles | sanitized reply, no raw screenshot/value in reply, repeat run, changed page/capture block, sender check |
| Phase 1 regression fixture | 7 inputs/1 button/7 labels, viewport/DPR; only visible fields; stable IDs |
| Separate collector | temporary values, element reference cleanup, repeated sensitive body text blocks |
| Phase 2 regression | original 7 tests unchanged and rerun |
| Static network/retention | no transport/logging/storage calls; connect-src none; unchanged minimal permissions |

These are Node fixtures/API doubles, not a new real-browser Phase 1 run and not proof
of actual Canvas pixels or Chrome capture alignment. Historical Phase 1/2 live-DOM
results above remain historical. No manual visual redaction pass is claimed.

### Real Canvas browser harness — UNVERIFIED

1. Reload the extension, then copy its ID from chrome://extensions.
2. Open `chrome-extension://<extension-id>/tests/redaction-browser.html` in Chrome.
   This is a packaged extension page, not a server or file-module workaround.
3. Expected: PASS, 320000 pixels checked, 5 opaque masks, Destination/Purpose unchanged,
   original password masked, 2x mapping. The harness compares every RGBA channel in
   actual decoded Canvas outputs using synthetic pixels only.
4. Record the actual PASS/FAIL and Chrome version when run. Current status: **UNVERIFIED**.

This synthetic harness tests the real redaction module but not captureVisibleTab or
alignment with the demo DOM; the following manual procedure is also required.

### Exact Phase 3 manual procedure — detailed checks pending

User report before Phase 4: "manual test paseed its shows sensistive in privacy data".
Recorded confirmation: user reports the manual test passed and the privacy display
shows sensitive information. This authorizes Phase 4. No exact count, individual mask
alignment, preserved Destination/Purpose pixels, SAFE indicator or Network-panel result
was explicitly reported; the detailed checks below remain UNVERIFIED.

Use only the existing fake data. For file://, enable Allow access to file URLs. Size or
zoom the window so all seven fields fit; if a field is offscreen it is intentionally
not counted/captured. Expand Compare local previews immediately; they expire after
60 seconds. Re-analyze to regenerate them. Never type a real password for testing.

| Step | Procedure and expected result | Status |
|---|---|---|
| P3-M1 | Reload EdgeSight at chrome://extensions; no manifest/worker errors | UNVERIFIED |
| P3-M2 | Open local Employee Travel Request; all seven fields visible | UNVERIFIED |
| P3-M3 | Open popup and ANALYZE PAGE; counts Inputs 7, Buttons 1, Labels 7; Capture Ready | UNVERIFIED |
| P3-M4 | Verify Sensitive = 5: Name, Email, Phone, Employee ID, Password | UNVERIFIED |
| P3-M5 | Expand Compare local previews; ORIGINAL — LOCAL ONLY shows local page, with password region always hidden | UNVERIFIED |
| P3-M6 | SANITIZED — SAFE CONTEXT fully black-masks Name, Email, Phone, Employee ID and Password; no glyph edges leak | UNVERIFIED |
| P3-M7 | Destination = Bengaluru remains visible in sanitized pixels | UNVERIFIED |
| P3-M8 | Purpose = Conference remains visible in sanitized pixels | UNVERIFIED |
| P3-M9 | Privacy filter shows 5 redacted regions, Visual Sanitized, Semantic Sanitized, Outbound SAFE; semantic preview has placeholders/filled, no sensitive raw strings | UNVERIFIED |
| P3-M10 | Inspect extension worker/popup DevTools Network during analysis; zero EdgeSight network requests (local image decoding is not a network transmission) | UNVERIFIED |
| P3-M11 | Analyze again; state/counts/previews stable, stale results not retained on failure | UNVERIFIED |

Additional manual checks, also **UNVERIFIED**:

- Repeat at ordinary browser zoom levels and HiDPI; every sensitive border/glyph covered.
- Close/reopen popup and wait 60 seconds: old preview sources are cleared; analyze restores them.
- Restricted chrome:// page: generic error, no stale SAFE result or preview.
- Scroll/resize/change form during capture: observed changes block rather than show SAFE.
- With fake data, repeat a sensitive value in a visible label: run blocks, no value in error.
- With fake data only, reveal the password field on the page: original preview must still mask it.

Runtime network count and actual demo redaction are pending user verification. Automated
static checks establish no network API implementation and a connection-blocking CSP;
they do not replace runtime observation.



## Phase 4 — automated and actual-engine evidence

User authorized Phase 4 after reporting the Phase 3 manual test passed and sensitive
information appeared in the privacy display. Only that report is recorded above; no
unreported detailed Phase 3 check is promoted to PASS.

The revised local-raw-pixel path replaces the earlier sanitized-input-only OCR path.
Automated API doubles prove captured raw PNG bytes reach OCR locally, sensitive OCR is
removed before popup/package output, and the packaged image remains Phase-3-sanitized.
No mocked inference result is evidence that Chrome OCR works.

Current automated results are recorded in the revision checkpoint below. The original
Phase 1–3 test files and seven detection assertions are retained. Build verifies the
same 18 packaged runtime/data/license assets (11,090,774 bytes), not new remote assets.

### Previous genuine Tesseract/WASM smoke run — Node, not Chrome

Executed `node scripts/smoke-ocr.mjs .browser-test/synthetic.png` under Node 24.11.0 on
Windows. The local synthetic image was 1000×750, with Arial 28-pixel safe labels and five
opaque rectangles. It contained no raw user data and was not committed. It was rendered
with System.Drawing, not obtained from the DOM. The test used the real pinned Tesseract
worker/core and locally packaged traineddata, not an OCR mock. This does NOT verify the
browser bundle, MV3 CSP, offscreen messaging, actual demo pixels or internet-disconnected
Chrome operation. Those remain manual checks.

Actual detected lines: Employee Travel Request; Employee Name; Email; Phone; Employee ID;
Destination; Bengaluru; Purpose; Conference; Password; Continue. All 11 had engine line
bounding boxes and confidence .95 or .96. Actual examples (x,y,width,height):

| Text | Screenshot-pixel box | Confidence |
|---|---|---|
| Destination | 42,326,138,20 | .96 |
| Bengaluru | 42,386,126,26 | .96 |
| Purpose | 42,446,103,26 | .95 |
| Conference | 41,506,145,20 | .96 |
| Continue | 41,626,112,20 | .96 |

| Node synthetic run | Initialization | Inference | Total |
|---|---|---|---|
| Cold | 758.37 ms | 500.52 ms | 1258.90 ms |
| Warm | 0 ms (reused) | 289.97 ms | 289.97 ms |

The actual result passed the output sanitizer and guard using the five existing fake
sensitive values extracted locally from demo-page/index.html; none appeared in released
output. At that earlier checkpoint, contaminated fixtures separately proved blocking. The revised
policy now removes individual sensitive lines before guarding the retained result. These timings are measured
Node test values, NOT browser or real-demo performance. Browser cold/warm timing is unmeasured.

Reproduce: `powershell -File scripts/create-ocr-fixture.ps1`, then
`node scripts/smoke-ocr.mjs .browser-test/synthetic.png`. The generated PNG is ignored.

### Browser-local real engine harness — UNVERIFIED

Browser automation inventory returned no available browser surfaces in this session.
No Chrome or manual result is claimed from it.

1. Reload EdgeSight and copy its extension ID from chrome://extensions.
2. Open `chrome-extension://<id>/tests/ocr-browser.html`.
3. Click Run cold / warm OCR test. This draws synthetic text plus a harmless PRIVATE FIELD
   TEXT phrase inside a sensitive test box. The raw Canvas PNG goes to actual browser OCR.
   Phase 3 separately masks the preview. Post-OCR geometry filtering must remove the phrase.
4. Expected: PASS for Destination, Bengaluru, Purpose, Conference, Continue; actual cold
   and warm results/boxes/confidence/timing appear; withheldItems is positive. The private
   synthetic phrase is absent from safe output. Inspect boxes on the sanitized preview.
5. This harness contains no raw PII and checks no real demo capture. Test actual demo
   privacy and offline operation separately below. Harness result remains UNVERIFIED.

### Phase 4 manual procedure — all UNVERIFIED

Reload the extension with its packaged assets. Use only the existing fake demo data.
Keep all fields visible; expand OCR details and Compare local previews promptly.

| ID | Procedure / expected result | Status |
|---|---|---|
| P4-M1 | Extension loads with packaged local OCR assets; no manifest/engine errors | UNVERIFIED |
| P4-M2 | Disconnect internet after loading (before first OCR); analysis still works from local assets | UNVERIFIED |
| P4-M3 | ANALYZE PAGE on Employee Travel Request; capture Ready, inputs 7/buttons 1/labels 7, Sensitive 5, local OCR Ready with actual items and processing time (Empty/Error is explicit, not a passing recognition check) | UNVERIFIED |
| P4-M4 | Actual OCR visibly recognizes Destination, Bengaluru, Purpose, Conference, Continue; record actual misses rather than forcing PASS | UNVERIFIED |
| P4-M5 | OCR overlay bounding boxes align with recognized text in sanitized screenshot | UNVERIFIED |
| P4-M6 | Safe OCR output has none of the five existing raw fake values in demo-page/index.html; privacy SAFE; detections in sensitive boxes are withheld, never printed | UNVERIFIED |
| P4-M7 | Worker/offscreen DevTools Network shows zero external OCR/model/CDN requests (chrome-extension local reads are allowed) | UNVERIFIED |
| P4-M8 | Second Analyze within two minutes succeeds; warm timing is shown; record actual times | UNVERIFIED |
| P4-M9 | Phase 3 still masks all five fields correctly; Destination/Purpose pixels remain visible | UNVERIFIED |
| P4-M10 | Simulate a missing asset in a disposable extension copy, reload and analyze: OCR reports unavailable/error within deadline while Phase 1–3 counts/redaction remain usable; restore copy after test | UNVERIFIED |

Also pending: close popup during OCR and reopen/retry, simultaneous Analyze rejection,
empty screenshot behavior, timeout recovery, 120-second idle disposal and HiDPI overlay.
All browser/manual timings and network observations remain UNVERIFIED.

## Phase 4 raw-local-OCR revision checkpoint (2026-09-10)

`npm test`: **56/56 test entries PASS**, including all Phase 1–3 regressions and
the original 7/7 detection assertions. `npm run build`: PASS (18 local assets/licenses,
11,090,774 bytes). `npm run check`: PASS (JS syntax, manifest and packaged asset hashes).
`git diff --check`: PASS. These are automated results, not manual Chrome confirmations.

Real pinned Tesseract/WASM executed again using the same ignored synthetic 1000×750 PNG.
For this test only, the harmless Employee Name line was treated as a sensitive region
(x=30,y=75,width=300,height=45). All 11 actual lines had boxes/confidence; the filter omitted
that one line and retained 10, including all five required safe targets. Their boxes and
confidence match the earlier table. No known fake sensitive value entered safe serialization.
This tests real engine output plus geometry filtering without storing a PII screenshot.
It does not prove real Chrome capture/masking accuracy or raw-PII OCR accuracy.

| Node synthetic run | Initialization | Inference | Raster cleanup | Total |
|---|---|---|---|---|
| Cold | 466.91 ms | 277.58 ms | 1.89 ms | 746.38 ms |
| Warm | 0 ms (reused) | 188.67 ms | 1.20 ms | 189.87 ms |

The real worker accepted the blank-image replacement and /input unlink, then successfully
performed warm OCR. No model reload occurred between runs. Timings are actual Node values,
not manually measured Chrome latency. Browser cold/warm timing remains UNVERIFIED.

Pure/API-double coverage additionally includes partial overlap and two-pixel padding,
HiDPI sensitive mapping, missing/malformed geometry, observation-scoped IDs with preserved
boxes, arbitrary non-sensitive text retention, all five known-value removals, obvious
email/phone/employee-ID rules outside fields, fragmented residual leak blocking, narrow
safe serialization, image-dimension mismatch, timeout and ordinary failure isolation.
The original Phase 1–3 assertions remain regression coverage.

## Phase 4 Chrome OCR failure + diagnostics checkpoint (2026-09-10)

Real Chrome, user-observed: LOCAL VISUAL PERCEPTION = ERROR, "Local OCR unavailable or timed
out. Phase 1–3 results remain available." Phases 1–3 pass (5 regions redacted, Outbound SAFE).
This checkpoint recorded a hypothesis — that the Node worker path differed from Chrome's Web
Worker / WASM / CSP path — which the Chrome run later DISPROVED. The real cause was a load-time
ESM import error (see the next section, D26): Node "passed" only because no Node test ever
linked the vendored browser bundle.

Static review verified every checkable cause CORRECT — and they genuinely were, just not the
fault: worker/core/lang URLs resolve to real `vendor/ocr/` files; the vendored worker strips a
trailing slash before appending core/lang filenames (no double-slash); `workerBlobURL:false`
gives a same-origin worker; CSP already grants `wasm-unsafe-eval`, `worker-src 'self'`,
`connect-src 'self' data:`. Root cause: **IDENTIFIED + FIXED in the next section.**

Automated results after adding diagnostics (Node 24.11.0, Windows):

| Command | Result | Passed | Failed |
|---|---|---|---|
| `npm test` | PASS | 57 test entries | 0 |
| `npm run check` | PASS (JS syntax, manifest, local asset hashes) | all | 0 |
| `node scripts/smoke-ocr.mjs .browser-test/synthetic.png` | PASS (cold+warm, 5 targets, 1 withheld) | both runs | 0 |

The 57th entry is the new regression: a host failure surfaces a stage-tagged diagnostic while
the thrown user-facing error stays generic. No root-cause OCR logic changed (see D25).

## Phase 4 Chrome OCR root cause + import fix (2026-09-10)

**Root cause (identified from the Chrome console):** `Uncaught SyntaxError: The requested
module '../../vendor/ocr/tesseract.esm.min.js' does not provide an export named 'createWorker'`,
thrown before OCR initialization. `ocr.js` used a NAMED import; the vendored Tesseract.js 6.0.1
browser bundle exports only `default` (`export { tesseract_min as default }`), with
`createWorker` as a property of it. Named-import linking happens before evaluation, so no OCR
code ran and the D25 stage diagnostics never fired — the "timed out" text was misleading.

**Fix (D26):** `import Tesseract from '.../tesseract.esm.min.js'; const { createWorker } =
Tesseract;`. No change to engine/version/worker/core/lang paths/timeout/CSP/offscreen — all
were already correct. Diagnostics retained.

**How the export shape was verified (Node 24.11.0, Windows):** the bundle's only export is
`default`; `typeof default.createWorker === 'function'`; `import { createWorker }` throws the
exact SyntaxError. Regression `extension/tests/ocr-import.test.mjs` (2 entries) links the bundle
the way Chrome does (ESM linking is spec-defined, so Node reproduces it) and shims `globalThis.self`
(the bundle references it at eval time) to inspect the evaluated exports.

| Command | Result | Passed | Failed |
|---|---|---|---|
| `npm test` | PASS | 59 test entries | 0 |
| `npm run check` | PASS (JS syntax, manifest, local asset hashes — vendored bytes/SHA-256 unchanged) | all | 0 |
| `node scripts/smoke-ocr.mjs .browser-test/synthetic.png` | PASS (cold+warm, 5 targets, 1 withheld) | both runs | 0 |

**Negative verification:** reverting `ocr.js` to the named import makes `ocr-import.test.mjs`
fail with `ocr.js OCR import contract regressed: ... does not provide an export named
'createWorker'` — proving the guard catches this exact regression. Restored after the check.
**LIMIT:** this proves the import/export CONTRACT, not full Chrome WASM/worker execution.

### P4-M0 — confirm the import fix in real Chrome (REQUIRED, UNVERIFIED)

1. Reload EdgeSight at chrome://extensions (EdgeSight → **Reload**).
2. chrome://extensions → EdgeSight → **Inspect views**: open BOTH the offscreen page console
   (`src/perception/offscreen.html`, appears during analysis) and the **service worker** console.
3. Run one ANALYZE on the demo page.
4. Confirm the `does not provide an export named 'createWorker'` SyntaxError is GONE and LOCAL
   VISUAL PERCEPTION initializes (no longer Status: ERROR from that cause).
5. If a NEW `[EdgeSight OCR] …` stage error appears, it is a SEPARATE second bug — copy the
   lines; the last stage before the error names the failing component:
   - `OCR_WORKER_CREATE` / `OCR_CORE_LOAD` / `OCR_LANGUAGE_LOAD` — worker spawn or packaged
     core/traineddata load (CSP, importScripts, fetch, or asset resolution).
   - `OCR_RECOGNIZE` — engine ran but recognition threw (suspect image input path next).
   - `OCR_TIMEOUT` — init/recognition genuinely exceeded the 45 s budget (slow cold start).
   Debug it next, one bug at a time. Status: **UNVERIFIED** until the user confirms.

## Phase 5 — SafeAgentContext (2026-09-10)

Local fusion of safe DOM semantics + safe visual OCR into one privacy-guarded structure. Pure
module `extension/src/privacy/agent-context.js`; no network/server/LLM/actions added.

| Command | Result | Passed | Failed |
|---|---|---|---|
| `npm test` | PASS | 71 test entries | 0 |
| `npm run check` | PASS (JS syntax, manifest, local asset hashes) | all | 0 |
| `node scripts/smoke-ocr.mjs .browser-test/synthetic.png` | PASS (cold+warm, 5 targets, 1 withheld) | both runs | 0 |

`agent-context.test.mjs` (12 entries) covers: construction/schema/freeze; goal validation
(type, whitespace, trim, 500-char cap); observation-id handling + missing/invalid rejection;
safe semantic fields retained with `source:"semantic"`; sensitive values only as `[ROLE]`
placeholders; safe visual elements retained with bbox/confidence/`source:"visual"`; provenance
never conflated; graceful no-visual case; redaction legend (present placeholders → descriptions,
no values); no raw screenshot bytes (image metadata only; a passed `dataUrl` is dropped); byte
measurement; and malformed-input rejection. `background.test.mjs` additionally asserts the wired
service worker emits a READY `agentContext` (obs id, `[EMAIL]` placeholder, `Continue` visual
element, positive `structuredContextBytes`/`sanitizedImageBytes`) and a REVOKED context on the
OCR-UNSAFE path.

**Security — deliberate contamination (fail closed):** the guard test injects each fake secret
(`Rahul Sharma`, `rahul@example.com`, `9876543210`, `EMP1024`, `secret123`) via the goal
(top-level), a field value (nested) AND visual OCR text (nested) — every case returns
`status:"BLOCKED"` with a generic reason that never echoes the value. This is the test's core
assertion: if the final gate were removed, these cases would go READY and the test would fail.

**Measured size:** a representative 7-field / 6-visual demo context serializes to **2195 bytes
(~2.1 KB)** (`structuredContextBytes`); the safe sanitized-image encoded size is reported
separately (`sanitizedImageBytes`). These are structure-size measurements, not a Chrome run.

### P5-M0 — confirm the SafeAgentContext in real Chrome (REQUIRED, UNVERIFIED)

After P4-M0 (OCR initializes), in the same ANALYZE run check the **Safe agent context** panel:
Status **READY**, an `obs_…` observation id, safe fields count, visual elements count, sensitive
hidden = 5, Privacy check **SAFE**, a small structured size (~2 KB). Expand **Preview safe agent
context** and confirm it shows `[NAME]`/`[EMAIL]`/`[PHONE]`/`[EMPLOYEE_ID]`/`[PASSWORD]` (never
the real values), `Bengaluru`/`Conference`, and a `Continue` visual element with a bbox. Status:
**UNVERIFIED** until the user confirms.

## Historical next task at the Phase 5 checkpoint (superseded by Phase 6A below)

User Chrome-verifies P4-M0 (OCR initializes, no createWorker SyntaxError) and P5-M0
(SafeAgentContext READY, placeholders, ~2 KB). Do not mark either PASSED until the user confirms.
Phase 6 (privacy-safe server transport + planner) has NOT started and must not start until
reviewed and until Chrome verification is done; it must consume the `agentContext` only.

## Phase 6A — privacy-safe transport and deterministic planner (2026-09-10)

User-confirmed evidence: **the current Chrome flow is working**, as stated in the
Phase 6A instruction. No new individual mask alignment, exact OCR recognition, timing,
offline, payload inspection or HiDPI pass is inferred. The old general awaiting-Chrome-
reload status is superseded by this report; detailed unreported checks remain pending.

| Check | Actual result |
|---|---|
| `npm test` | PASS: 115/115 Node test entries, including all Phase 1–5 regressions and original 7/7 classifier assertions |
| `npm run check` | PASS: JS/test/script syntax, manifest JSON and pinned OCR asset SHA-256 |
| `.venv/Scripts/python.exe -m unittest discover -s tests -v` from server/ | PASS: 24/24 methods, plus parameterized validation/privacy/planner/CORS subcases |
| `.venv/Scripts/python.exe -m compileall -q app tests` | PASS: Python syntax |
| `.venv/Scripts/python.exe -m pip check` | PASS: no broken requirements |
| Uvicorn bound to 127.0.0.1:8000 + `node scripts/smoke-planner.mjs` | PASS: real HTTP health, actual requestPlan CLICK/STOP and observation binding; 1553-byte approved synthetic context |
| `node scripts/smoke-ocr.mjs .browser-test/synthetic.png` | PASS: real Node/WASM cold+warm, five safe targets including Continue, one synthetic sensitive-region line withheld |
| `git diff --check` | PASS |

Server runtime tested: Python 3.10.11, FastAPI 0.141.1, Pydantic 2.13.5,
Uvicorn 0.52.4. Test dependency httpx 0.28.1 works with the installed Starlette
1.6.0 but emits a TestClient deprecation warning; no failed assertions.
The HTTP smoke uses synthetic safe JSON, not a Chrome screenshot or a manual demo.
The OCR smoke uses the existing ignored synthetic fixture; it does not claim new
Chrome timings. No raw screenshot artifact or PII dump is added.

### Transport boundary proof

`extension/tests/transport.test.mjs` contains 44 test entries. The exact intercepted
POST body equals JSON.stringify of the actual builder-approved context. The server
fixture is also checked against that builder to prevent request-schema drift.
Body has image metadata only, no localPreview/dataUrl/raw OCR/raw DOM/raw screenshot.

All five controlled fake values (`Rahul Sharma`, `rahul@example.com`, `9876543210`,
`EMP1024`, `secret123`) are absent from valid transmitted bytes. Each fake value is
injected separately at goal, semantic field, visual element and nested metadata:
**20/20 cases return privacy BLOCKED, bytes=0 and fetch count=0**. Copies cannot
carry the private approval; frozen approved originals cannot be mutated. A separate
test exercises the actual builder's known-value failure (including a non-demo secret),
then proves transport still cannot fetch. No secret list is passed into transport.

Coverage includes endpoint/config/privacy options, forged clean contexts, raw strings,
proxies/accessors, strict CLICK/STOP, HTTP 400/403/422/500, network failure, malformed
JSON, unknown action/target, stale/missing observation, missing target, extra selector/
coordinate keys, and both fetch/body deadlines with an aborted signal. Worker
integration proves no network on module load, no request on revoked OCR, a request
bound to the actual emitted context and preserved local output when the server is offline.

Server tests cover health, schema types/version, bounded goal, false-only PII flag,
safe status, 20 fake-PII/location cases, other obvious patterns, missing/malformed
observation metadata, bbox/confidence, null confidence, extra raw keys at five schema
locations, duplicate IDs, fixed redaction/field policy, CLICK/STOP conditions,
target-supply/observation binding across 14 IDs, invalid response fields, malformed
JSON and exact-origin CORS. Invalid input yields a generic 422 body without input values.

### P6A-M1 — manual Chrome/server demo (core flow user-verified; see Phase 6B evidence)

1. Start FastAPI using the exact Windows commands in server/README.md; configure
   EdgeSight's actual extension origin. Confirm GET /health returns status ok.
2. Reload EdgeSight at chrome://extensions; allow file URL access.
3. Open Employee Travel Request (demo-page/index.html), with all fields and Continue visible.
4. Enter: **Check whether this travel request is complete and submit it.**
5. Open the extension's **service worker DevTools → Network** and click **ANALYZE / PLAN**.
6. Confirm local perception succeeds.
7. Confirm local privacy **SAFE**.
8. Confirm Safe agent context **READY**.
9. Confirm the server receives **POST /plan** (inspect the service worker Network request;
   access logging is disabled, so no payload logging is needed).
10. Inspect Payload as readable JSON. Verify it contains none of Rahul Sharma,
    rahul@example.com, 9876543210, EMP1024, secret123; no image bytes/raw OCR/DOM envelope.
11. Inspect response: **CLICK**, target is the actual Continue visual ID from this
    request, and observationId equals the request observation.id.
12. Confirm popup shows **Planner decision: CLICK Continue**.
13. Confirm the browser **DOES NOT CLICK** and the travel form remains on screen.

At the original Phase 6A checkpoint these steps were pending. The subsequent user
confirmation below verifies the reported core flow; unreported supplementary checks
are not automatically promoted to passed. If OCR does not yield one exact Continue text match, STOP is
the honest expected rule outcome; do not fabricate a visual ID or recognition success.

Additional pending manual checks: opening popup alone creates no /plan request;
stop server and Analyze / Plan again → Planner unavailable while local privacy/
perception/context remain visible. Inspect for zero external OCR/model/CDN requests;
the authorized localhost /plan request is now expected. No Phase 7 execution is implemented.

Exact next implementation task after review: **Phase 6B — ONE real server-side
LLM/VLM planner**, preserving the same privacy-safe request and strict response schema.
Do not implement Phase 6B, Phase 7 or Phase 8 in this checkpoint.

## Phase 6B — one privacy-safe AI planner

### Phase 6A manual verification — user-confirmed

The Phase 6B instruction confirms **Phase 6A manually Chrome-verified**:
Chrome extension → POST /plan → FastAPI → HTTP 200. Actual transmitted context:
fields=7, sensitiveFieldCount=5, redactedRegionCount=5, rawPiiIncluded=false,
privacy.status=safe. Sensitive values appear as [NAME], [EMAIL], [PHONE],
[EMPLOYEE_ID], [PASSWORD]; Bengaluru and Conference remain. The user confirms
the deterministic planner flow works. No additional unreported no-click, timing,
offline, geometry/HiDPI or failure-mode check is inferred.

### Automated Phase 6B evidence

| Command/check | Actual result |
|---|---|
| npm test | PASS 120/120 extension entries, including all Phase 1–6A regressions and 7/7 original classifier assertions |
| .venv/Scripts/python.exe -m unittest discover -s tests -v (server/) | PASS 50/50 methods: 24 existing + 26 AI methods, with parameterized cases |
| npm run check | PASS JS/script/test syntax, manifest, packaged OCR asset hashes |
| .venv/Scripts/python.exe -m compileall -q app tests | PASS Python syntax |
| .venv/Scripts/python.exe -m pip check | PASS no broken requirements |
| node scripts/smoke-ocr.mjs .browser-test/synthetic.png | PASS genuine Node/WASM cold/warm, Continue retained, one synthetic sensitive line withheld |
| Temporary Uvicorn on 127.0.0.1:8011, safe fixture over actual HTTP | PASS deterministic 200/CLICK and AI missing-key 503, matching mode headers, health; test processes stopped |
| git diff --check | PASS |

No actual provider call occurred. Presence-only checks found no provider variables or
root/server .env. No key value was read, displayed or added. The provider HTTP tests
use httpx.MockTransport with a synthetic credential and inspect only the request
body, never retain/print auth headers. FastAPI 0.141.1, Pydantic 2.13.5, Uvicorn 0.52.4,
httpx 0.28.1; existing Starlette TestClient deprecation warning remains non-failing.

**Provider privacy proof:** exact captured HTTP application body has one fixed system
message and one user-role JSON projection. All five fake values are absent and all
five placeholders are allowed. No credential, observation ID, timestamp, geometry,
field ID, extension/environment/debug metadata or images are in model content.
Semantic source=local-browser-semantics and visual source=local-pixel-ocr are distinct.

Five fake values × goal/field/visual/nested input = **20/20 cases block at direct AI
entry with provider.complete call count=0**. The same matrix through /plan yields
422 and another **20/20 zero-call cases**. Tests also block unknown clean metadata,
model-instance bypasses, projection-guard failure and oversized input before calling
the provider. Phase 6A's separate 20-case zero-fetch regression still passes.

**Output security:** **23/23 malicious/malformed cases reject**: selector/invented ID,
coordinates, RUN_JS, additional JavaScript/URL/version/observation fields, wrong/null
target policies, unsafe/private/empty/long/non-allowlisted reasons, plain text,
invalid/empty/null/array/fenced JSON and duplicate keys. Valid CLICK and STOP preserve
the exact Phase 6A contract. Five supplied visual IDs are exercised with server-owned
observation binding. Candidate mutation during provider wait cannot change binding.

**Prompt injection:** injected goal and pixel text impersonating system instructions
remain data in the user-role JSON; the fixed system prompt is unchanged. It explicitly
states untrusted-data policy, never reconstruct placeholders, and only filled=true
means filled. Mocked RUN_JS output is rejected. This tests separation and enforcement,
not a claim that a real model always ignores malicious screen text.

**Failures/modes:** missing/blank key makes no HTTP client call; network/timeouts,
301/401/403/429/500/503, refusal, incomplete/empty/multiple/tool outputs, malformed and
oversized provider envelopes fail generically without retries/redirects/fallback.
Deterministic mode never invokes a provider. Header-only mode signaling preserves
strict JSON; extension tests cover ai/deterministic/unknown/missing headers and
AI failure without fabricated fallback success. No latency metric is claimed.

### P6B-M1 — real provider and Chrome demo (PENDING)

1. After automated tests pass, use server/README.md to enter a real NVIDIA_API_KEY
   privately in the server terminal. Set PLANNER_MODE=ai and the exact extension origin;
   start Uvicorn. Never put the key in Chrome or chat.
2. Reload EdgeSight; open Employee Travel Request with all fields and Continue visible.
3. Goal: Check whether this travel request is complete and submit it.
4. Analyze / Plan. Confirm local perception READY, privacy SAFE, context READY,
   server Connected and Planner NVIDIA AI. Inspect the service worker Network POST body.
5. Confirm response CLICK targets the actual supplied Continue visual ID and echoes
   the request observation ID. Popup displays CLICK Continue.
6. Confirm browser does NOT click; no execution exists in Phase 6B.
7. Inspect only safe server status and, where reasonably available, sanitized
   provider-bound content. Never log/inspect the credential or auth header. Do not
   enable HTTP debug dumps. Automated body capture is not a real-network inspection.

**All Phase 6B real-provider/Chrome steps remain PENDING** because no NVIDIA_API_KEY
was configured in this session's shell (the NVIDIA endpoint was verified out-of-band by
the user). The --ai smoke option can be run against NVIDIA AI mode using the synthetic
safe fixture; it incurs real NVIDIA requests and was not run here. Unknown PII/OCR
errors, semantic model mistakes and account/model availability remain limitations.
NVIDIA data retention is governed by NVIDIA's policy. Note: json_object output does not
enforce the reason enum provider-side, so an off-enum reason is rejected 502 by design.

Exact next task after review (superseded by Phase 7 below): Phase 7 execution.

## Phase 7 — safe visually grounded execution (2026-09-10)

### Automated Phase 7 evidence

| Check | Result |
| --- | --- |
| npm test | PASS **152/152** extension entries (120 prior + 32 new Phase 7); all Phase 1–6A/6B regressions intact |
| .venv/Scripts/python.exe -m unittest discover -s tests (server/) | PASS **50/50** methods (server untouched) |
| npm run check | PASS syntax, manifest and packaged-OCR asset integrity |

New tests in `extension/tests/action.test.mjs`:
- Geometry (`toViewportPoint`): 1:1 mapping, 2x pixel density, non-uniform X/Y scaling,
  bbox-center + fractional coordinates, edge-clamp, invalid screenshot/viewport dims,
  negative/zero-size bbox (INVALID_GEOMETRY), out-of-viewport (OUT_OF_VIEWPORT);
  `overlapsSensitive` substantial-overlap/disjoint/below-threshold/zero-size.
- Ticket binding (`ticketForPlan`): valid CLICK mints; STOP, observation mismatch,
  unknown / other-observation target, and CLICK-without-target mint nothing.
- Execution policy (`executeTicket`, mocked chrome deps): one dispatch pinned to the
  observed documentId; null/consumed → ACTION_ALREADY_CONSUMED; replay executes once;
  stale TTL → STALE_OBSERVATION; missing/wrong-active tab → TAB_CHANGED; navigated URL →
  PAGE_CHANGED; invalid geometry and sensitive overlap block before dispatch; a
  navigated-away document (executeScript throws) → PAGE_CHANGED; injected block reason
  surfaced without repair. In every blocked case executeScript is NOT called.
- Element safety (`clickInPage` against a DOM stub): button, span-inside-button, submit
  input, role=button accepted and clicked once; random div, disabled, aria-disabled,
  hidden (display:none), zero-size, no-element-at-point, point-outside-rect (covered),
  materially changed viewport, and clear text mismatch all rejected with no click.

Coordinate formula (screenshot pixels → CSS viewport pixels), for the record:
`scaleX = viewport.width / screenshot.width`, `scaleY = viewport.height / screenshot.height`;
`viewportX = (bbox.x + bbox.width/2) * scaleX`, `viewportY = (bbox.y + bbox.height/2) * scaleY`.
No `devicePixelRatio == 1` assumption — captureVisibleTab yields a viewport image at the
device pixel ratio, so the scale absorbs it.

### P7-M1 — manual positive demo (PENDING)

1. Start FastAPI (deterministic is sufficient to isolate execution; NVIDIA AI preferred
   with a real NVIDIA_API_KEY). Reload EdgeSight; reset the Employee Travel Request form.
2. Goal: Check whether this travel request is complete and submit it. Analyze / Plan.
3. Confirm Perception READY, Privacy SAFE, Safe context READY, Planner decision
   CLICK Continue with a valid visual_N, and that the page has NOT changed yet.
4. Press EXECUTE SUGGESTED ACTION. Confirm the actual Continue button is clicked and the
   page transitions to the submitted view.
5. Record ONLY "CLICK executed / page changed." Do NOT claim success verification — that
   is Phase 8 (fresh perception).

### P7-M2 — manual negative demo (PENDING)

Analyze / Plan, then switch to another tab or navigate the page, then press EXECUTE.
Expected: Action BLOCKED (e.g. "Page changed — analyze again." / "Active tab changed —
analyze again."), and NO click occurs. Valuable safe-failure evidence for judges.

**Both P7-M1 and P7-M2 remain PENDING**: the unpacked extension was not loaded in the
coding shell (loading it needs a native file dialog that cannot be automated here), and no
NVIDIA_API_KEY was configured. The Phase 7 execution logic is exercised by the automated
tests above against mocked chrome/DOM; that is not a substitute for the Chrome demo.

Exact next task after review: **PHASE 8 — re-observation and visual verification: fresh
capture after the Phase 7 click → new observation → local OCR/CV → confirm the outcome
(e.g. "Travel Request Submitted"). DO NOT START PHASE 8 here.**

## Phase 8 - fresh local visual outcome verification (2026-09-11)

This section supersedes historical next-phase instructions above. Phases 0-8 are complete
in code; Phase 9 has NOT started. Manual acceptance is recorded separately below.

| Check | Actual result |
| --- | --- |
| npm test | PASS **207/207 extension entries**: original 152 unchanged + 55 Phase 8 |
| server/.venv/Scripts/python.exe -m unittest discover -s tests -v, from server with relative .venv path | PASS **50/50 server methods**, unchanged code; sandbox escalation required for interpreter access |
| npm run check | PASS JavaScript/test/script syntax, manifest, packaged OCR hashes |
| node scripts/smoke-ocr.mjs .browser-test/synthetic.png | PASS actual Node/WASM cold/warm OCR; Continue retained and synthetic sensitive line withheld; not Chrome evidence |
| Existing ignored .browser-test/smoke-phase6b.py | PASS temporary FastAPI HTTP deterministic 200/CLICK and ai missing-key 503 with correct headers; no provider request, processes stopped |
| git diff --check | PASS |

### New automated evidence

verification.test.mjs: exact phrase, case, whitespace and terminal punctuation positive;
full-phrase negative matrix (Travel Request, Submitted, Request Submitted, Pending,
Failed, unrelated submitted, partial-word variants and inserted punctuation); shuffled
horizontal/vertical reading order; reverse/distant/different-column/intervening text
rejection; empty pixels; old identity/pre-dispatch timestamp rejection; semantic-only
goal/field phrase cannot verify; server/planner/raw/forged approval rejection; actual
confidence/null retention; fixed spec; tab/window/missing/active checks; one-attempt
failures/no match; transaction/API deadlines and late-result rejection.

verification-integration.test.mjs executes the REAL shared local pipeline with Chrome,
Canvas and OCR API doubles. It proves distinct pre/post capture strings, a second OCR
call using exactly the new image, changed decoded dimensions, new observation UUID and
regenerated observation-scoped visual IDs; a new URL/document is accepted while each
new capture pins its own document. Privacy inputs include five synthetic name/email/
phone/employee-ID/password canaries even after the action: masks rerun, raw canaries
are absent from result/popup payloads/logs, fragmented sensitive text revokes output.

The worker integration records exactly capture -> OCR -> click -> capture -> OCR,
VERIFYING then VERIFIED events, distinct old/new IDs, one click and one initial planner
fetch. **Verification network calls = ZERO** (including /plan/NVIDIA/other endpoints).
Blocked replay and concurrent Analyze/Execute add no capture, click or plan. Standalone
verification tests also spy fetch with zero calls, and never dispatch an action.
A pre-action OCR phrase plus a fresh-frame miss returns NO_VISUAL_MATCH, never success.
Capture errors, OCR error, actual bridge OCR timeout (mocked timer advances the existing
45s limit and verifies host closure), redaction error, fragmented-PII failure, missing/
switched/during-capture tab changes, empty and no-match all fail safely without retry.
The OCR timeout maps to PERCEPTION_FAILED under the unchanged Phase 4 contract.

verification-popup.test.mjs runs the actual popup script against DOM/runtime doubles:
CLICK DISPATCHED / VERIFYING / VISUALLY VERIFIED transition, expected evidence only,
distinct IDs, SAFE only from metadata, friendly failure/Analyze again, unrelated message
rejection and reopening from retained safe metadata without planning or execution.
These are behavior tests, not screenshot/layout or native Chrome acceptance.

### Policy tested

Exactly one attempt after 750 ms; five-second local API/redaction waits, 45-second OCR
bound and 60-second transaction bound. Fresh capture UUID/capturedAt (strictly after
click dispatch acknowledgement), actual decoded dimensions and fresh OCR every time.
No old URL/document gate after dispatch; require same intended active tab/window.
Full normalized phrase with Unicode word boundaries, retained punctuation, no fuzzy
spelling. Join <=3 consecutive OCR boxes in row/x order only with the documented
spatial adjacency limits (AI_CONTEXT.md). Record actual confidence, no new threshold.
Timing hooks are real numeric local measurements, not completed Phase 9 evaluation.

### P8-M1 - manual positive Chrome demo: PENDING

1. Start FastAPI on 127.0.0.1:8000 with --no-access-log and exact extension-origin CORS.
   Prefer ai only with the user's privately supplied valid rotated NVIDIA key;
   deterministic mode is sufficient to isolate Phases 7/8. Record actual mode.
2. Reload EdgeSight 0.8.0, enable file access if required, reset Employee Travel Request
   and keep all seven inputs and Continue visible.
3. Goal: Check whether this travel request is complete and submit it.
4. Analyze / Plan: confirm pixel OCR Ready, privacy SAFE, SafeAgentContext READY,
   planner CLICK Continue. The guarded Action target is the before visual evidence.
5. Press EXECUTE SUGGESTED ACTION. Observe actual Continue click and submitted page.
6. Observe automatic VERIFYING and fresh capture/OCR. Result must be VISUALLY VERIFIED,
   Evidence Travel Request Submitted, SAFE backed by the new privacy run, and a new
   verification observation ID distinct from Before observation. The popup is the
   primary judge display; no raw PII or DevTools is required to read this evidence.
7. If investigating network, count no verification /plan or external requests; packaged
   extension-local OCR messaging/assets are allowed. Do not upload screenshots.

Actual this session: **PENDING, not performed to acceptance**. Chrome was launched via
Computer Use, but the tool stopped because it could not reliably determine the current
browser URL for policy enforcement. No further browser input was issued; extension
reload, click and fresh visual verification were not observed. No manual planner mode
can be reported. Separately, synthetic HTTP smoke used deterministic and ai missing-key
modes; it is not the manual demo. No NVIDIA_API_KEY configured, no root/server .env,
no credential contents accessed and no live provider call.

### P8-M2 - manual negative Chrome demo: PENDING

Analyze/Plan on the reset form, Execute, then switch to another tab immediately before
the 750ms verification capture. Reopen the popup and expect NOT VERIFIED, TAB_CHANGED,
Analyze again, and no unrelated page counted as evidence. The completed click is not
undone; verification only observes. No replan or second click. This exact native Chrome
path was NOT observed; automated switched-tab and no-match cases PASS above.

### Prior manual statuses retained

Phase 6B integrated NVIDIA Chrome PENDING. Phase 7 positive Chrome click PENDING.
Phase 7 stale/wrong-page negative PENDING. Phase 6A historical user confirmation remains
PASS with its original scope. Neither Phase 8 code nor API-double tests promote these.
The full goal -> local perception/privacy -> safe AI planning -> click -> fresh local
perception -> visual success loop remains a desired manual demonstration, not a pass.

Known limits: a slow transition can miss the one frame; text confidence is uncalibrated;
OCR/unknown-PII errors remain; text presence is not backend persistence or causal proof;
non-atomic tab/capture checks and cross-origin activeTab permission loss can fail closed;
worker teardown loses the transient result. No metrics dashboard or benchmark claims.

The above is the historical Phase 8 checkpoint. Phase 9 evidence follows.

## Phase 9 - automated evidence (2026-09-11)

- npm test: **230/230 PASS**, all 207 prior tests retained plus 23 additions.
- npm run test:metrics: **21/21 PASS** (subset of extension suite).
- Server unittest discovery: **52/52 PASS**, all 50 prior methods plus 2 additions.
- npm run check: syntax/manifest/packaged OCR asset integrity PASS.
- Separate scripts/smoke-ocr.mjs on the existing ignored synthetic fixture: cold/warm
  Ready + SAFE PASS. This is additional Node/WASM smoke, not Chrome evidence.
- npm run benchmark: actual 5-screen pixel quality pass, 2 worker-cold runs, 5 warm
  recognitions, 10 detector/context/server-stage repetitions, 30 redaction adapter
  repetitions, 10 real deterministic loopback HTTP responses (all 200). No AI call.
- Benchmark output contains all runs, including HTTP outliers, and fixture/source
  hashes. Reviewed reference JSON/table are in benchmarks/reference. METRICS.md has
  exact formulas, counts, environment and measured values. Benchmark output privacy
  canaries passed. These scores are independent of unit-test pass rates.

New metrics tests cover precision/recall/F1 and zero denominators, invalid confusion
counts, mean/median/min/max/nearest-rank percentile, UTF-8 bytes, normalization,
misses/duplicates/unexpected items, rejected DOM provenance, actual difficult PII
cases exposing TP/FP/FN/TN, partial/disjoint/invalid IoU, missed/duplicate/unnecessary
masks and actual redaction commands. Numeric timing projection rejects arbitrary
strings and nonfinite/negative data. Machine total excludes human delay.

Integration tests append to the original suites: actual worker observation/plan and
verification timers, actual current-run bytes/dimensions, 9000ms simulated human
interval excluded, no metrics in planner payload, no extra verification fetch/click;
popup displays measured finite values, legitimate zero, -- for unavailable values,
and no fake accuracy percentage. Server tests verify numeric Server-Timing/CORS and
unchanged five-key plan response; invalid input never echoes data in timing headers.

Run from repository root:

```powershell
npm test
npm run test:metrics
npm run check
npm run benchmark
Set-Location server
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

The Windows sandbox cannot access this venv interpreter; approved execution outside
the sandbox ran the server suite and benchmark. This is an environment limitation,
not a skipped server regression. Default benchmark stops its temporary HTTP process.
Optional benchmark --ai is separate, explicitly requested via CLI and requires a
privately configured key. It was not performed here.

## Phase 9 manual acceptance - PENDING

Current browser-control inventory returned no apps/browsers; NVIDIA key presence was
false. No new Chrome timing run, real click, visual verification or AI request was
observed. Historical Phase 8 browser URL-policy rejection remains historical.
Phase 6A user-confirmed PASS is preserved. Phase 6B integrated NVIDIA, Phase 7 positive
and stale/wrong-page, Phase 8 positive/negative, and Phase 9 live timings remain PENDING.

Reload extension 0.9.0 and follow P8-M1/M2 above. On Analyze, confirm actual Performance
values appear. On Execute, observe real click, fresh pixel verification and timings;
record success/failure status, before/after observation, planner mode, plan latency,
post-execution latency and separate human interval. Machine total must exclude the
human interval. Reopened popup uses retained worker timing boundaries. Repeat and
retain failures; do not substitute Node benchmarks for Chrome results. Manual resource
measurement and exact timing definitions are in METRICS.md; no CPU/GPU/RAM is claimed.

## Phase 11A - NVIDIA Nemotron planner path verification (2026-09-12)

Objective: prove NVIDIA Nemotron genuinely decides the next action (not local code deciding
and the model merely explaining). Verified WITHOUT a live key (none configured); the live
NVIDIA HTTP round-trip itself remains PENDING.

Verified offline / locally:
- Architecture (code trace): AI mode calls `plan_ai` -> `prepare_ai_input` -> `NvidiaProvider`
  -> `parse_decision`. The returned `PlanResponse` uses the MODEL's action/target/reason.
  The server only validates (CLICK target must be in `actionCandidates`; STOP target null)
  and never substitutes its own decision. AI mode never falls back to the deterministic planner.
- Server suite 54/54 PASS, incl. valid CLICK/STOP, malformed / refusal / tool /
  duplicate-key / markdown-wrapped output rejected as 502, hallucinated (`visual_999`) and
  non-actionable ("Password") targets rejected, provider timeout (504), all upstream
  statuses -> 503, missing key -> explicit 503 (not a deterministic CLICK), deterministic
  mode never calls the provider, and the exact privacy-safe request body (role placeholders
  present, the five canary secrets absent).
- Live deterministic HTTP smoke (real uvicorn): `/health` ok; `node scripts/smoke-planner.mjs`
  PASS (CLICK, STOP, observation binding; 1586-byte approved payload).
- Live AI-mode fail-closed (real uvicorn, no key): POST /plan -> 503, header
  `X-EdgeSight-Planner: ai`, body `{"detail":"AI planner unavailable."}`. Confirms AI mode
  attempts the provider and fails closed rather than returning a deterministic CLICK.

Added this phase: on AI failure the server sets a safe numeric
`X-EdgeSight-Planner-Upstream-Status` header carrying the NVIDIA HTTP status (e.g. 404 wrong
model, 401 bad key, 429 rate limit) so a live run is diagnosable. No payload/PII/key is ever
logged or returned (regression-tested).

PENDING (requires a real key, server-side only):
1. From `server/`: set `NVIDIA_API_KEY` (private), `PLANNER_MODE=ai`, start uvicorn.
2. `node scripts/smoke-planner.mjs --ai` -> expect plannerMode `ai`, CLICK/STOP READY.
3. On failure read `X-EdgeSight-Planner-Upstream-Status`: 404 => fix `NVIDIA_MODEL`; 401 =>
   key; 429 => rate limit; a 502 => model returned an unparseable / off-contract decision.
4. Then the Chrome manual run: reload extension, open the demo, ANALYZE/PLAN (do NOT
   Execute), confirm popup planner = NVIDIA / ai with a CLICK on a real current visual id,
   and POST /plan 200 in the network tab.

Exact next task: complete the live NVIDIA check above, then **Phase 11B** - autonomous
OBSERVE -> PLAN -> ACT -> OBSERVE loop. Not started.
