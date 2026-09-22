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

## Phase 11B - autonomous observe-plan-act loop (2026-09-12)

Made the existing CLICK/STOP pipeline autonomous. Action set stays CLICK + STOP only; no
vocabulary expansion, no voice, no NAVIGATE/TYPE. The controller is orchestration only -
Nemotron still decides every action; local code never plans.

| Check | Actual result |
| --- | --- |
| npm test | PASS **259/259 extension entries** (248 prior + 11 new: 10 controller scenarios + 1 wired integration) |
| server/.venv/Scripts/python.exe -m unittest discover -s tests | PASS **65/65** (server code unchanged) |
| npm run check | PASS JS/test/script syntax, manifest, packaged OCR asset hashes |
| git diff --check | PASS |
| secret scan (changed files) | no api-key/authorization/credential patterns; canary values only match existing fixtures |

### Controller unit tests - `agent-controller.test.mjs` (10 entries)

Pure state machine, all side effects injected. 1: CLICK -> execute -> re-observe -> STOP
completes with the expected event order. 2: STOP on step 1 executes no action. 3: invalid
target (no ticket) fails INVALID_TARGET without executing. 4: execution-time
STALE_OBSERVATION fails the run. 5: planner unavailable -> FAILED PLANNER_UNAVAILABLE (no
fallback). 6: privacy failure -> FAILED PRIVACY_FAILED with no PLAN_READY and no execute.
7: thrown perception failure -> FAILED PERCEPTION_FAILED. 8: MAX_STEPS reached -> STOPPED.
9: cancellation after observe -> CANCELLED, pending plan never executes. 10: identical
action on unchanged observation past the limit -> FAILED LOOP_DETECTED (two clicks allowed,
third blocked before dispatch).

### Wired integration - `agent-integration.test.mjs` (1 entry)

Drives the real `service-worker.js` `RUN_TASK` through the full local privacy pipeline with
Chrome/Canvas/OCR/fetch doubles. Planner returns CLICK on the first observation and STOP on
the re-observed page. Asserts: state COMPLETED / reason PLANNER_STOP at step 2; planner
consulted twice (once per fresh observation); exactly one guarded click; two full observe
transactions; the synthetic canary appears in no request body; a second run succeeds after
the first releases `agentActive`. Manual-mode regression (`background.test.mjs`
Analyze/Execute) remains green, proving manual mode survived the refactor.

### Policy tested

MAX_STEPS=5. Duplicate guard limit 2 on (safe-context signature + action + target).
Post-action settle 750 ms, then the next step re-observes fresh pixels (re-observation is a
real capture + planner call, never faked). Stale plans cannot act (ticket carries its own
observationId; execution re-validates). Cancellation stops the run and prevents a pending
plan from executing. Planner-unavailable / privacy / perception / action failures fail
closed with no fallback and no retry. Audit events are count/id/status only - never target
text (popup `AGENT_UPDATE` may carry the already-guarded local target text for display).

### P11B-M1 - live autonomous Chrome demo: VERIFIED (user)

1. Start FastAPI in AI mode (real NVIDIA_API_KEY, server-side only), exact extension origin.
2. Reload EdgeSight; open the Employee Travel Request demo, all fields + Continue visible.
3. Goal: Check whether this travel request is complete and submit it. Press **RUN TASK** once.
   Do NOT press manual Plan/Execute.
4. Expect step 1: observe -> privacy SAFE -> NVIDIA CLICK Continue -> local click. Step 2:
   fresh observe of the submitted page -> NVIDIA STOP -> agent status TASK COMPLETE.
5. Confirm rawPiiIncluded=false and planner NVIDIA AI throughout; no deterministic fallback.

User confirmation when requesting Phase 11C: one RUN TASK starts the loop, real NVIDIA
Nemotron plans, CLICK executes locally, fresh re-observation and another planner call
occur, STOP terminates, privacy remains SAFE, and manual mode works. Stable baseline:
7a8f5d0. This supersedes the earlier pending status; it is user-reported live evidence.

## Phase 11C — safe browser action vocabulary (2026-09-12)

| Check | Fresh result |
|---|---|
| Targeted browser-actions.test.mjs | 24/24 PASS |
| Complete extension suite, npm test | 284/284 PASS |
| Complete server suite, unittest discover -s tests | 76/76 PASS |
| npm run build | PASS; 18 OCR assets/licenses packaged |
| npm run check | PASS; syntax, manifest, packaged asset integrity |
| npm run scan:secrets | PASS; credential-pattern scan, no matched values logged |
| git diff --check | PASS |

New coverage includes strict per-action parameters at server/model/client boundaries;
TYPE task-text authorization and local sensitive/password/readonly/stale/covered target
rejection; native setter/input events and revalidation after focus/beforeinput handlers;
approved editable focus for ENTER; unsupported-key rejection; bounded enum-only SCROLL;
HTTP/S normalization and invalid-scheme/credential/malformed URL rejection; document,
active-tab, permission, TTL and cancellation gates for navigation; load-event cleanup.
Actual observer tests verify stable local control identities without reading field values.

The new wired service-worker regression drives NAVIGATE → TYPE → ENTER → SCROLL → STOP
through the real privacy/context/transport/ticket/controller path using browser/OCR/provider
doubles. It checks five unique observations, old-document rejection, safe candidate
metadata and no private-canary/raw-image leakage. Existing CLICK/STOP, manual execution,
privacy fail-closed, planner fail-closed, MAX_STEPS, cancellation and duplicate guards pass.
These are automated tests, not live NVIDIA or Chrome results.

### Live Phase 11C acceptance: VERIFIED (user), items 1-3

1. Restart that AI server; run node scripts/smoke-planner.mjs --ai from repository root.
   Require real CLICK for the complete travel fixture and STOP for the no-target fixture.
   **PASS** (see planner-latency diagnostic below for the STOP-stage timeout this uncovered
   and the fix).
2. Reload EdgeSight/demo and repeat the travel RUN TASK regression, plus manual mode.
   Require planner ai, current approved CLICK, fresh observation, STOP, privacy 5/5 and
   rawPiiIncluded=false. **PASS** ("travel regression PASS", user-reported).
3. From root serve only the controlled fixture directory:
   py -3.10 -m http.server 8137 --bind 127.0.0.1 --directory demo
   Enable browsing across sites in the popup. From an ordinary observable page RUN TASK:
   "Open http://127.0.0.1:8137/search.html and search for calculus videos using Enter.
   Scroll until the first video title is visible, then stop."
   Require model-selected NAVIGATE/TYPE/ENTER/SCROLL and STOP from fresh observations;
   no script in the fixture chooses planner actions. Privacy must remain SAFE; this page
   has zero sensitive fields, so the travel demo's 5/5 counts do not apply here.
   **PASS** ("multi-action workflow PASS", user-reported).
4. Only after controlled acceptance, try "Open YouTube and search for calculus videos."
   once. Report any external-site block; synthetic keys and dynamic OCR may limit it.
   **Not yet reported** — optional stretch check, not required for Phase 11C acceptance.
5. Record actual evidence (below), commit/push the acceptance documentation, STOP. No voice phase.

## Phase 11C planner-latency diagnostic and fix (2026-09-12)

Live smoke (item 1 above) initially returned real CLICK success but a real STOP-stage
`504 PROVIDER_TIMEOUT` at the 30s provider deadline, reproduced twice
(`elapsedMs` 30019 and 30087) while CLICK completed in 5.7s and 3.5s on the same runs —
smaller STOP input taking longer ruled out prompt/context size as the cause.

Root cause: `max_tokens: 256` on a `response_format: json_object` request let the model
spend its full output budget on a long freeform `reason` for the ambiguous "empty page"
STOP case, instead of the short fixed-string reason the contract requires; at the
observed token rate this reliably exceeded the 30s deadline. Not a browser, privacy,
action-fusion, connectivity, or Phase 11C-logic issue — confirmed via the earlier
allowlisted failure-code diagnostics (`X-EdgeSight-Planner-Failure`,
`X-EdgeSight-Planner-Upstream-Status`) added this phase, which isolated the category
to `PROVIDER_TIMEOUT` before any code changed.

Fix: `server/app/nvidia_provider.py` lowers `max_tokens` to 96 (a valid one-action
decision is ~20-80 tokens; temperature/response_format/`enable_thinking:false` unchanged).
No timeout increase, no model change, no fallback, no prompt/schema weakening.

Live re-verification (user, real NVIDIA, after the fix): both CLICK and STOP now
`READY` well under the deadline — **planner latency ~1.34s CLICK, ~0.98s STOP**
("NVIDIA CLICK/STOP smoke PASS").

Tooling added alongside the fix (kept, not diagnostic-only): `requestPlan` and
`scripts/smoke-planner.mjs` surface `plannerMs` (server `Server-Timing`, isolates real
provider latency from localhost overhead) and the smoke script supports `--repeat N`
with a numeric min/median/max summary per stage, for future latency regression checks.
`extension/tests/smoke-planner.test.mjs` covers: allowlisted-vs-private failure codes
reaching diagnostics, STOP-stage 504 naming without reading the error body, NVIDIA
upstream-status passthrough without leaking headers/bodies, repeat-mode summary
statistics, wrong-decision/health-timeout/unreachable-server handling, and a real CLI
subprocess exit-code check. `server/tests/test_actions.py` covers rejected-provider-output
diagnostics without model text and the `PlannerFailure` code allowlist (private codes
collapse to a fixed generic one).

| Check | Result |
|---|---|
| server/.venv/Scripts/python.exe -m unittest discover -s tests | PASS 78/78 |
| npm test | PASS 292/292 |
| npm run check | PASS syntax/manifest/packaged-asset integrity |
| git diff --check | PASS |
| npm run scan:secrets | PASS, no credential patterns |

Phase 11C is now live-verified end to end: real NVIDIA CLICK/STOP, the travel RUN TASK
regression, and the controlled multi-action NAVIGATE/TYPE/ENTER/SCROLL/STOP workflow all
pass with practical (~1s-class) planner latency. Remaining optional item: an
uncontrolled YouTube attempt (item 4), not required for acceptance.

## Phase 12 — unified voice + text goal input (2026-09-12)

A mic button beside the goal input uses browser-native SpeechRecognition /
webkitSpeechRecognition (popup-only). Voice is speech-to-text ONLY: the transcript fills
the SAME goal input; the user reviews/edits it; the existing RUN TASK controller runs
unchanged. Voice never triggers an action, no audio is recorded/stored/sent, only the
final goal string enters the existing pipeline. No server change, no new dependency/API/key.

| Check | Result |
|---|---|
| npm test | PASS 298/298 (292 prior + 6 new voice tests) |
| server unittest discover -s tests | PASS 78/78 (untouched) |
| npm run check | PASS |
| git diff --check | PASS |
| npm run scan:secrets | PASS, no credential patterns |

`extension/tests/voice-popup.test.mjs` runs the real popup.js against DOM/chrome doubles
with an injected fake SpeechRecognition: (1) typed goal still starts a normal run via the
existing controller; (2) voice transcript populates the same goal input and does NOT
auto-run; (3) voice then RUN TASK feeds the transcript through the existing controller;
(4) empty/whitespace transcript rejected, goal unchanged, no run; (5) recognition error
resets mic state and starts no run; (6) unsupported SpeechRecognition disables the mic with
a fallback message while text mode keeps working. Existing autonomous/action/privacy/popup
suites remain green.

### Phase 12 hotfix — goal input typing + microphone permission (2026-09-12)

Two live bugs found after the initial Phase 12 commit (b553ba1) were fixed:

- **Goal input not typeable (root cause):** CSS cascade — `.mic { width:auto }` and
  `.btn { width:100% }` had equal specificity and `.btn` came later, so the mic button
  took `width:100%` with `flex:0 0 auto` (no shrink), collapsing the `flex:1` goal input
  to ~0 width. The input was visually collapsed, not disabled. Fixed with higher-specificity
  `.goal-row .mic` / `.goal-row .goal { flex:1 1 auto; min-width:0 }` that beat `.btn`
  regardless of source order.
- **Mic never prompted for permission:** the handler now calls
  `navigator.mediaDevices.getUserMedia({ audio:true })` first (immediately stopping the
  returned tracks — no audio captured; SpeechRecognition opens its own stream), then starts
  recognition. Denied/no-device/unsupported and recognition `not-allowed` map to safe
  fallback messages; the goal input stays editable and no run starts. The whole voice block
  is try/catch-wrapped so a voice failure can never break text input. No manifest permission
  added (getUserMedia prompts from the extension page's secure context).

| Check | Result |
|---|---|
| npm test | PASS 303/303 (298 prior + 5 net-new voice tests, now 11 in the file) |
| server unittest discover -s tests | PASS 78/78 (untouched) |
| npm run check | PASS |
| git diff --check | PASS |
| npm run scan:secrets | PASS, no credential patterns |

`extension/tests/voice-popup.test.mjs` (11 tests) now also injects a fake
`navigator.mediaDevices.getUserMedia` and asserts: goal input editable by default;
mic click requests permission BEFORE recognition and stops the temporary tracks; permission
denial / no-microphone / unsupported all show safe messages, start no run, and leave the
goal input editable and text mode working; recognition `not-allowed` maps to the
permission-denied message. Plus the original transcript/no-auto-run/empty-transcript checks.

### Live Phase 12 acceptance: PENDING (user)

Cannot be automated in the agent environment (loading the unpacked extension needs a native
file dialog; browser automation init has failed here previously).

1. Reload at chrome://extensions; reopen the popup.
2. Click the goal box and type "test goal" — MUST work now (the collapse bug is fixed).
3. Clear it and press the mic. Chrome should now prompt for the microphone. Allow it.
4. Say "Open YouTube and search for calculus videos". Expect the transcript in the goal
   input, NO browser action yet. Press RUN TASK — the existing agent takes over.
   Voice acceptance only requires the spoken command reaching the goal path; YouTube-specific
   behavior is out of scope.
5. Known Chrome limitation: even with the mic granted, Web-Speech in an MV3 popup can still
   return a `network` error on some Chrome builds. The fallback messaging handles this and
   text mode always works; if it recurs, report the exact recognition `error` code.

---

## Phase 13A — autonomous STOP / completion semantics (2026-09-23)

Regression target: the controller returned `COMPLETED` for **every** planner STOP, so a
run that performed no action (no usable target, or unsafe to continue) was displayed as
**TASK COMPLETE**. Only `The goal is already achieved.` may complete a run.

| # | Test | Purpose | Input | Expected | Actual | Result |
|---|------|---------|-------|----------|--------|--------|
| 1 | `13A-1` achieved-goal STOP | Success is reachable | STOP + `The goal is already achieved.` | COMPLETED / `GOAL_ACHIEVED` | as expected | PASS |
| 2 | `13A-2` x7 non-success reasons | No false success | Each real AI + deterministic STOP reason | STOPPED, never COMPLETED | as expected | PASS |
| 3 | `13A-3` x6 fail-closed | Unknown reason cannot succeed | `undefined`, `null`, `''`, unknown string, `constructor`, `42` | STOPPED / `STOP_UNCLASSIFIED` | as expected | PASS |
| 4 | `13A-4` live success shape | CLICK -> re-observe -> STOP | achieved-goal STOP on step 2 | COMPLETED, timings `[CLICK, STOP]` | as expected | PASS |
| 5 | `13A-5` live non-success shape | Click happened, success withheld | no-target STOP on step 2 | STOPPED, timings `[CLICK, STOP]` | as expected | PASS |
| 6 | popup: success label | UI says complete only on success | COMPLETED / `GOAL_ACHIEVED` | `TASK COMPLETE` | as expected | PASS |
| 7 | popup: 15 non-success states | UI never implies success | every STOPPED/FAILED/CANCELLED code | `TASK STOPPED` / `TASK FAILED` / `TASK CANCELLED` | as expected | PASS |
| 8 | popup: unmapped code | Unknown code is not success | `SOME_FUTURE_CODE` | `TASK STOPPED`, note without "complete" | as expected | PASS |
| 9 | planner unavailable (existing `5`) | Fail closed, no fallback | planner `UNAVAILABLE` | FAILED / `PLANNER_UNAVAILABLE` | unchanged | PASS |
| 10 | privacy failure (existing `6`) | Fail closed before planning | `observeReason: PRIVACY_FAILED` | FAILED, no PLAN_READY, no execute | unchanged | PASS |
| 11 | MAX_STEPS (existing `8`) | Not a completion | 8 non-STOP steps | STOPPED / `MAX_STEPS` | unchanged | PASS |
| 12 | cancellation (existing) | Cancel is its own state | `cancelled() === true` | CANCELLED | unchanged | PASS |
| 13 | drift guard: constant parity | JS mirrors server | read `ai_contract.py` | JS constant == `GOAL_ACHIEVED_REASON` | as expected | PASS |
| 14 | drift guard: enum coverage | No unclassified server reason | read `SafeReason` literal | all 5 classified, exactly 1 success | as expected | PASS |
| 15 | drift guard: deterministic reasons | None may succeed | read `planner.py` `stop("...")` | all classified, all non-success | as expected | PASS |
| 16 | manual path untouched | No regression | existing verification popup + integration suites | unchanged behaviour | unchanged | PASS |

`npm test`: **343/343 PASS** (was 303; +40). `npm run check` PASS. `git diff --check` PASS.
`npm run scan:secrets` PASS (191 text files, 0 credential patterns).

### Mutation verification

Each mutation was applied, observed to fail, and reverted — so these tests are known to
detect the defect rather than merely pass alongside it.

| Mutation | Result |
|---|---|
| Controller restored to `return done(COMPLETED, ...)` for every STOP | **14 tests fail** |
| Popup renders non-success state as `TASK COMPLETE` | **9 tests fail** |
| Server gains a `SafeReason` value with no classification | drift guard fails |
| Extension `GOAL_ACHIEVED_REASON` drifts from the server constant | 2 drift guards fail |

### Server tests: NOT RUN — environment blocker

Python 3.9.6 only on this machine; `fastapi==0.141.1` requires >= 3.10, and `server/.venv`
is a Windows virtualenv. Python changes were verified by `py_compile` and by AST-extracting
`SafeReason` (5 values, success value present) and comparing `GOAL_ACHIEVED_REASON` against
the JS constant (exact match). **User action:** run
`.venv/Scripts/python.exe -m unittest discover -s tests -v` from `server/` on the Windows
3.10 venv and confirm the 53 server test methods still pass with the extended enum.

### Live Phase 13A acceptance: PENDING (user)

Cannot be automated here (unpacked-extension load needs a native dialog; no NVIDIA key).
**AI mode is required** — deterministic mode cannot observe completion and will always end
TASK STOPPED, which is correct behaviour, not a regression.

1. `PLANNER_MODE=ai` with `NVIDIA_API_KEY` set server-side; restart the server.
2. **Success case.** Open `demo-page/index.html` with all seven fields filled and Continue
   visible. RUN TASK with "Check whether this travel request is complete and submit it."
   Expect: step 1 CLICK Continue -> settle -> step 2 re-observe -> STOP with
   `The goal is already achieved.` -> **TASK COMPLETE**, note "the planner reported the
   goal achieved".
3. **Non-success case.** Clear one required field (e.g. Purpose) and RUN TASK again.
   Expect STOP with a non-success reason -> **TASK STOPPED** (or TASK FAILED), and the note
   explaining the goal was not confirmed. It must NEVER read TASK COMPLETE.
4. **Deterministic control.** Set `PLANNER_MODE=deterministic`, restart, repeat step 2.
   Expect TASK STOPPED — deterministic mode cannot assert completion.
5. Manual path regression: press ANALYZE / PLAN then EXECUTE SUGGESTED ACTION. Behaviour
   must be identical to Phase 12 (CLICK DISPATCHED -> VERIFYING -> VISUALLY VERIFIED).

Note: `TASK COMPLETE` currently reflects the **planner's** judgement that the goal was
reached, not independent pixel verification. Wiring Phase 8 verification into the
autonomous loop is a later phase and remains an open issue.

---

## Phase 13B — popup run-state rehydration (2026-09-23)

Regression target: closing and reopening the popup during an autonomous run showed Idle,
hid STOP TASK and re-enabled RUN TASK while the worker was still acting. The worker's run
snapshot is now the source of truth; the popup queries it on every open.

All in `extension/tests/agent-state.test.mjs` unless noted.

| # | Requirement | Test | Result |
|---|-------------|------|--------|
| 1 | popup opens idle | `popup open, idle` — card hidden, STOP hidden, RUN enabled | PASS |
| 2 | opens during run -> RUNNING | `popup reopen during a run` | PASS |
| 3 | step / maxSteps restored | same — `2 / 8`; worker test `step 1`, `maxSteps 8` | PASS |
| 4 | last safe action restored | same — `TYPE` (action only, no target text) | PASS |
| 5 | STOP TASK available after reopen | same — STOP shown, RUN + ANALYZE disabled | PASS |
| 6 | cancel after reopen cancels same run | worker test — `CANCEL_TASK{runId}` -> summary runId equal, CANCELLED, 0 clicks after | PASS |
| 7 | reopen starts no duplicate run | popup sends only GET_VERIFICATION + GET_AGENT_STATE; worker rejects second RUN_TASK | PASS |
| 8 | completed restores TASK COMPLETE | `popup reopen after COMPLETED/GOAL_ACHIEVED`; worker retains COMPLETED snapshot | PASS |
| 9 | non-success STOP restores TASK STOPPED | `... STOPPED/STOP_NO_TARGET` | PASS |
| 10 | failed restores TASK FAILED | `... FAILED/PLANNER_UNAVAILABLE` | PASS |
| 11 | cancelled restores TASK CANCELLED | `... CANCELLED/CANCELLED` | PASS |
| 12 | no page/OCR/PII/model text | worker test: exact key whitelist; no known PII, OCR `Continue`, goal, plan reason, URL, image; reducer drops target text, non-vocabulary actions, exception-like reasons | PASS |
| 13 | manual mode unaffected | `verification-popup.test.mjs`, `background.test.mjs` (open now also sends read-only GET_AGENT_STATE) | PASS |
| 14 | Phase 13A semantics green | `agent-outcome-popup.test.mjs`, `outcome-contract.test.mjs`, `agent-controller.test.mjs` | PASS |
| - | stale runId | worker rejects `CANCEL_TASK` for an older run (`STALE_RUN`), run keeps going; popup ignores other-run AGENT_UPDATEs; reducer ignores other-run events | PASS |

`npm test`: **353/353 PASS** (was 343; +10). `npm run check` PASS. `git diff --check` PASS.
`npm run scan:secrets` PASS (193 text files) with the untracked local `server/.venv-mac/`
excluded for the run via a session-only `core.excludesFile`; unexcluded, its only hit is an
SPDX license identifier in pip's vendored `_spdx.py` (false positive, not repo content).
Server code unchanged; server tests not run.

### Mutation verification

| Mutation | Result |
|---|---|
| Popup never sends GET_AGENT_STATE on open | **5 tests fail** |
| Popup accepts AGENT_UPDATEs from any run | **1 test fails** |
| Worker CANCEL_TASK ignores runId | **1 test fails** |
| Reducer puts target text into lastAction | **2 tests fail** |
| Terminal event does not release STOP/RUN controls | **1 test fails** |

### MV3 service-worker limitation (honest scope)

Run state lives only in service-worker memory (no `chrome.storage`; the retention test
forbids it). While a run is active the worker is continuously making extension-API calls
and a localhost fetch, which keeps it alive in practice. If Chrome terminates it anyway,
the run itself stops (no code survives) and a reopened popup shows Idle — it does not
learn the lost run's outcome. After a run ends and the popup is closed, the idle worker is
suspended after ~30 s; reopening before that shows the final state, after that shows Idle.
This phase guarantees rehydration only while the worker (and so the run/state) exists.

### Live Phase 13B acceptance: PENDING (user)

Cannot be automated here: opening/closing an extension action popup needs a human.

1. Reload the unpacked extension. Start the server (AI or deterministic mode).
2. On a page with a multi-step task (e.g. `demo/search.html` workflow), press RUN TASK.
3. While it is running, close the popup (click the page). Reopen it within a step or two.
   Expect: card shown, Status **RUNNING**, Step `N / 8` matching the current step,
   Last decision shows the action type, **STOP TASK** visible, RUN TASK disabled.
4. Press STOP TASK. Expect **TASK CANCELLED**, note "Stopped by user.", and no further
   browser action afterwards (the run stops at its next cancellation check).
5. Completed run: run a task to its end with the popup open, close the popup, reopen
   within ~30 s. Expect the same final label (TASK COMPLETE / STOPPED / FAILED). After
   the worker idles out, Idle is the expected, documented result.
6. Manual path: ANALYZE / PLAN then EXECUTE behaves as before.

---

## Phase 13C — autonomous result verification (2026-09-23)

BEFORE: TASK COMPLETE = planner-declared success. AFTER: TASK COMPLETE = planner-declared
success + local verification of the current fresh post-action observation. The verifier
reuses Phase 8's gates (approved privacy context, new observation, capture after dispatch)
with a goal-agnostic evidence rule (safe state changed since the last executed action). It
is evidence of a visible effect, not formal or universal goal verification.

New tests in `extension/tests/agent-verification.test.mjs` unless noted.

| # | Requirement | Test | Result |
|---|-------------|------|--------|
| 1 | CLICK -> reobserve -> GOAL_ACHIEVED -> verify PASS -> COMPLETED | `1/8/13` (controller); worker test success run (real verifier) | PASS |
| 2 | GOAL_ACHIEVED + verify FAIL -> not COMPLETED | `2/14`; worker test unchanged-page run -> STOPPED / VERIFICATION_FAILED / NO_STATE_CHANGE | PASS |
| 3 | verifier unavailable -> not COMPLETED | `3` — missing, throwing, no verdict -> VERIFIER_UNAVAILABLE, no exception text leaks | PASS |
| 4 | non-success STOP -> verification not run | `4` | PASS |
| 5 | planner unavailable -> not run | `5/6` | PASS |
| 6 | privacy failure -> not run | `5/6` | PASS |
| 7 | stale observation cannot complete | `7`; verifier unit: pre-action context, same id, pre-dispatch capture -> STALE_OBSERVATION | PASS |
| 8 | verifier receives fresh post-action state | `1/8/13` — op obs_2 + context, lastAction obs_1 + pre-action signature | PASS |
| 9 | no raw unsafe data | verifier accepts only the builder-approved frozen context (clone, planner envelope, raw object, null -> PRIVACY_FAILED); worker test: verification events/state free of PII, OCR text, goal, image | PASS |
| 10 | manual Phase 8 verification works | `verification.test.mjs` (39), `verification-popup.test.mjs`, `verification-integration.test.mjs` unchanged and green | PASS |
| 11 | Phase 13A mapping green | `outcome-contract.test.mjs`, `agent-outcome-popup.test.mjs`, controller 13A tests | PASS |
| 12 | Phase 13B GET_AGENT_STATE green | `agent-state.test.mjs`; worker test reads state after both runs | PASS |
| 13 | verified success snapshot -> COMPLETED | `1/8/13` (reducer), worker test | PASS |
| 14 | failed verification snapshot never COMPLETED | `2/14`, worker test | PASS |
| - | success claimed before any action | inconclusive test -> VERIFICATION_INCONCLUSIVE | PASS |
| - | cancel during verification | -> CANCELLED | PASS |
| - | popup | verification log line; all three codes -> TASK STOPPED, note never "complete" | PASS |

Updated existing tests (they encoded planner-only completion): `agent-controller.test.mjs`
(verifier stub; step-1 STOP now VERIFICATION_INCONCLUSIVE; 13A-1 preceded by an action),
`browser-actions.test.mjs` (verifier sees obs_5 after obs_4), and three worker fixtures
whose page now visibly changes after the last action.

`npm test`: **369/369 PASS** (was 353; +16). `npm run check` PASS. `git diff --check` PASS.
`npm run scan:secrets` PASS (194 files; untracked `server/.venv-mac/` excluded via a
session-only `core.excludesFile`). Server unchanged; server tests not run.

### Mutation verification

| Mutation | Result |
|---|---|
| A. Bypass verification (13A behaviour: GOAL_ACHIEVED -> COMPLETED) | **10 tests fail** |
| B. Verification failure treated as COMPLETED | **6 tests fail** |
| C. Verifier given the pre-action observation | **6 tests fail** |
| D. Verification run for every STOP regardless of reason | **15 tests fail** |
| E. Verifier skips the freshness gate | **1 test fails** |
| F. Verifier skips the state-change check | **2 tests fail** |

### Live Phase 13C acceptance: PENDING (user)

Not automatable here (extension popup + NVIDIA key). **AI mode required**: deterministic
mode never claims GOAL_ACHIEVED, so it can only end TASK STOPPED.

1. `PLANNER_MODE=ai` + `NVIDIA_API_KEY`; restart server; reload the unpacked extension.
2. **Success.** `demo-page/index.html`, all seven fields filled. RUN TASK: "Check whether
   this travel request is complete and submit it." Expect: CLICK Continue -> fresh
   observation -> STOP `The goal is already achieved.` -> agent log
   "result verification VERIFIED" -> **TASK COMPLETE**.
3. **Inconclusive.** Reload the page, submit it manually so the success panel shows, then
   RUN TASK with the same goal. If the planner claims success without acting, expect
   "result verification NOT VERIFIED" -> **TASK STOPPED** ("before any action was taken").
   If it instead chooses a non-success STOP, that is also correct (never TASK COMPLETE).
4. Manual path: ANALYZE / PLAN -> EXECUTE still reaches VISUALLY VERIFIED as before.

---

## Phase 13D — action grounding + voice reliability (2026-09-23)

### Target accuracy

Root cause: an editable input's OCR'd value ("Bengaluru") is a valid TYPE candidate, but
server and client both allowed CLICK on any candidate. Fix: editable => TYPE-only, via a
derived `allowedActions` projection plus server and client CLICK guards.

| # | Requirement | Test | Result |
|---|-------------|------|--------|
| 1 | plain value "Bengaluru" not CLICK-capable | `action-grounding.test.mjs` 1/3; server `test_editable_field_value_is_type_only_never_click` | PASS |
| 2 | real button CLICK-capable | `action-grounding` 2; server test (`allowedActions == ["CLICK"]`, CLICK accepted) | PASS |
| 3 | textbox TYPE-capable, not CLICK | `action-grounding` 3; server (`["TYPE"]`, `["TYPE","PRESS_KEY"]` when focused) | PASS |
| 4 | CLICK target must be CLICK-compatible | server 502 INVALID_TARGET; client validateAction; worker test: planner CLICK on the value => not READY, nothing executable | PASS |
| 5 | non-interactive OCR text = context only | `action-grounding` 5; server (`allowedActions == []`) | PASS |
| 6 | live-shaped form resolves generically | `action-grounding` 4/6 (real pipeline: value => input/editable, button => CLICK-capable, heading => context; safe `clickable=1 typeable=1` log with no text) | PASS |
| 7 | TYPE/SCROLL/NAVIGATE green | `browser-actions*.test.mjs`, `action.test.mjs` unchanged | PASS |
| 8 | privacy unchanged | privacy/redaction suites unchanged; no new wire field; log counts only | PASS |
| 9 | 13C verifier unchanged | `agent-verification.test.mjs` unchanged, green | PASS |

Mutations: remove client guard => 3 fail; remove server guard => 1 fails; project editable as
CLICK => 4 fail. All reverted.

### Voice

Failure category found in code: an extension popup cannot show Chrome's mic prompt, so
getUserMedia is rejected unasked and the popup reported "permission denied" — the same text
as a real block; a `network` error showed a generic error. Now each outcome carries a code,
and a one-time grant tab fixes the prompt limitation.

| Case | Code / behaviour | Test | Result |
|---|---|---|---|
| never granted (state `prompt`) | MIC_PERMISSION_REQUIRED + grant button opens `src/popup/mic-permission.html` | voice-popup | PASS |
| blocked (state `denied`) / recognition `not-allowed` | MIC_PERMISSION_DENIED | voice-popup | PASS |
| no device / `audio-capture` | MIC_NOT_FOUND | voice-popup | PASS |
| no mediaDevices | MIC_UNAVAILABLE | voice-popup | PASS |
| no SpeechRecognition | SPEECH_UNSUPPORTED, mic disabled | voice-popup | PASS |
| `network` | SPEECH_NETWORK_ERROR | voice-popup | PASS |
| `no-speech`, empty transcript, silent end | SPEECH_NO_RESULT | voice-popup | PASS |
| transcript | fills the same goal box, no RUN_TASK, not echoed in status | voice-popup | PASS |

`npm test` **379/379** (was 369). Server **79/79** (was 78) via untracked `server/.venv-mac`
(Python 3.12), unmodified. `npm run check`, `git diff --check`, `scan:secrets` (197 files,
venv excluded for the run) PASS.

### Live Phase 13D acceptance: PENDING (user)

Needs Chrome + AI mode (`PLANNER_MODE=ai`, `NVIDIA_API_KEY`); restart the server (server code
changed) and reload the unpacked extension.

A. Travel demo, goal "Check whether this travel request is complete and submit it.":
   expect `Step 1: plan → CLICK Continue` (never `CLICK Bengaluru`) → CLICK dispatched →
   fresh observation → planner success → `result verification VERIFIED` → TASK COMPLETE.
   The service-worker console shows `ACTION_FUSION ... clickable=N typeable=M` (counts only).
   If the model still picks the field value, expect TASK FAILED / planner unavailable (the
   invalid target is rejected), never a click on it — report that result.
B. Voice: press 🎤. If the status ends `(MIC_PERMISSION_REQUIRED)`, press GRANT MICROPHONE
   ACCESS, allow in the tab, reopen EdgeSight. Press 🎤, say the goal: the transcript appears
   in the goal box, nothing runs until RUN TASK. Any failure shows a code in parentheses —
   report it (e.g. SPEECH_NETWORK_ERROR means Chrome's speech service was unreachable; text
   input remains the primary path).

---

## Phase 13E — ready state vs achieved goal (2026-09-23)

Prompt-only fix: GOAL_ACHIEVED needs visible evidence of the requested result; prerequisites
are not results. Model behaviour can only be proven live; offline tests pin the policy and the
live checker's own logic.

| # | Requirement | Offline test | Live check (`scripts/smoke-semantics.mjs`) |
|---|-------------|--------------|------------------------------|
| 1 | completed form + submit goal + submit-like candidate -> not GOAL_ACHIEVED | smoke-semantics: STOP:GOAL_ACHIEVED fails `form-ready-submit` | `form-ready-submit` expects CLICK visual_12 |
| 2 | completed form + candidate -> CLICK allowed | `form-ready-submit`, `generic-ready-send` pass on CLICK; server accepts | same, PENDING |
| 3 | visible post-action result -> GOAL_ACHIEVED allowed | `result-visible` passes only on achieved STOP | PENDING |
| 4 | search typed, no results -> not achieved | `search-typed-no-results` fails on achieved STOP | PENDING |
| 5 | navigation pending -> not achieved | `navigate-pending` fails on achieved STOP | PENDING |
| 6 | STOP failure semantics unchanged | outcome-contract + controller 13A tests unchanged; `no-target-unfinished` | PENDING |
| 7 | 13A/13B/13C green | full suite 383/383 | - |
| - | policy text pinned, generic | server `test_ready_state_is_not_achieved_policy` (no Continue/Bengaluru/travel/YouTube/visual_ ids in the new policy) | - |

All six scenario contexts and their correct decisions were run through the real server
`prepare_ai_input` + `plan_ai` validation (mac venv) — all accepted.

Extension **383/383**, server **80/80**, `npm run check`, `git diff --check`, `scan:secrets`
(199 files, untracked venv excluded for the run) PASS.

### Live Phase 13E acceptance: PENDING (user)

1. Restart the server in AI mode (prompt changed). Run `node scripts/smoke-semantics.mjs`.
   Expect `PASS semantics: 6/6`; any FAIL line names the scenario and the fixed outcome code.
2. Reload the extension. Travel goal "Check whether this travel request is complete and
   submit it." Expect: step 1 CLICK Continue -> dispatched -> step 2 fresh observation ->
   STOP / GOAL_ACHIEVED -> result verification VERIFIED -> TASK COMPLETE.
3. If step 1 is a non-success STOP instead, read `ACTION_FUSION ... clickable=N` in the
   service-worker console: `clickable=0` means Continue was not grounded (e.g. not in view).

---

## Phase 13F — stable planner reason codes (2026-09-23)

| Check | Test | Result |
|---|---|---|
| each reasonCode -> its fixed message on the wire | server `test_reason_code_maps_to_fixed_message_and_success_needs_visible_evidence` | PASS |
| non-STOP carries ADVANCE_GOAL message whatever code was sent | same | PASS |
| GOAL_ACHIEVED with zero visual elements -> INSUFFICIENT_CONTEXT | same | PASS |
| invalid code -> INVALID_REASON; free-text `reason` -> rejected, never forwarded | `test_rejected_output_has_fixed_diagnostic_without_model_text`, `test_malicious_and_malformed_outputs_rejected_without_repair` | PASS |
| explicit per-code policy; no reason sentences or demo tokens in the policy | `test_ready_state_is_not_achieved_policy` | PASS |
| every server message classified, exactly one success | extension drift guards (`outcome-contract.test.mjs`) | PASS |
| new messages non-success | `agent-controller.test.mjs` 13A-2 list (+2) | PASS |
| 13A/13B/13C unchanged | full extension suite | PASS |
| scenario contexts + correct codes accepted by the real server | manual run of `prepare_ai_input` + `plan_ai` (mac venv) | PASS |

Server **81/81**, extension **385/385**, check, diff-check, scan:secrets PASS.

### Live: `node scripts/smoke-semantics.mjs` — PENDING (user, AI mode)

Not runnable here (no NVIDIA key). Restart the server, run it, expect `PASS semantics: 6/6`.
Only then run the travel RUN TASK in Chrome.
