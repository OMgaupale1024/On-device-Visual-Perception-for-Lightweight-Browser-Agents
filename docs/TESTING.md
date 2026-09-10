# EdgeSight — Testing

Test log. One row per check. Do not claim something works without testing it.
Historical phase checks are retained below; current Phase 3 evidence and pending manual checks follow.

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

## Next exact task

Verify the import fix via P4-M0 above (user's Chrome reload). Do not mark Chrome OCR PASSED
until the user confirms. If a new stage error surfaces, debug that one next, then re-verify
P4-M1–M10. Phase 5 (DOM + visual fusion) has NOT started and must not start until Chrome OCR
is verified.
