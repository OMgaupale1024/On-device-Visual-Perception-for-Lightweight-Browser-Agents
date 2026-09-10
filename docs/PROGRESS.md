# EdgeSight — Progress

CURRENT PHASE:
Phase 4 code complete. Chrome root cause IDENTIFIED and FIXED in code: ocr.js imported a
named `createWorker` that the vendored default-export-only Tesseract bundle never provided,
so Chrome threw a load-time ESM SyntaxError before any OCR ran. Import corrected; awaiting the
user's Chrome reload to confirm OCR now initializes. NOT yet Chrome-verified. Phase 5 not started.

STATUS:
Browser-local OCR/CV perception baseline implemented with Tesseract.js 6.0.1, core 6.1.2,
English data 1.0.0. Genuine Node/WASM synthetic inference passed, including boxes/confidence.
User-observed in real Chrome: LOCAL VISUAL PERCEPTION = ERROR ("Local OCR unavailable or
timed out"); Phases 1-3 still pass (5 regions redacted, Outbound SAFE). The failure was
swallowed at four catch layers with no logging. Static review verified every checkable
cause is CORRECT: worker/core/lang URLs resolve to real packaged files, the vendored worker
strips trailing slashes before appending filenames, workerBlobURL=false gives a same-origin
worker, and CSP already grants wasm-unsafe-eval + connect-src 'self'. The Chrome run then
revealed the fault was NOT runtime: `ocr.js` used a named `createWorker` import, but the
vendored Tesseract.js 6.0.1 browser bundle exports only a default (`createWorker` is a
property of it), so Chrome threw a load-time ESM SyntaxError during module linking — before
any OCR code, and before the D25 diagnostics could run. The import is now corrected (default
import + destructure); see D26. Demo recognition, offline operation and browser timing in
Chrome remain UNVERIFIED pending the user's reload.

MANUAL EVIDENCE:
The user reported the Phase 3 manual test passed and sensitive information appeared in the
privacy display. No exact counts, individual masks, preserved pixels or network results were
confirmed. Detailed checks remain pending in TESTING.md. Historic Phase 1 M1–M4 are preserved.

COMPLETED:
- Phases 0–3 foundations, value-free detection, local capture/redaction and privacy guard.
- Packaged local OCR runtime/worker, embedded-WASM SIMD and non-SIMD LSTM cores, English data.
- Offscreen worker host, local-only CSP, warm worker reuse, idle disposal, 45-second timeout.
- PNG-only inference interface; no DOM text, selectors, labels or fallback inside OCR.
- Raw local PNG inference, actual line boxes/confidence and init/inference/cleanup/total timing.
- Post-inference sensitive-box overlap filtering plus known-value/obvious-PII removal.
- Blank raster replacement and input-file cleanup while preserving a warm OCR model.
- Known-value guard (including case/spacing variants); unsafe output revokes image package.
- Local text/details UI and bounding-box overlay; graceful OCR-only failure state.
- 59/59 automated test entries pass, including Phase 1–3 regressions and 7/7 detection assertions.
- Stage-tagged, privacy-safe OCR diagnostics: a single audited sink (perception/diagnostics.js)
  logs only stage + error class/short message to the offscreen and service-worker consoles;
  every other source file stays log-free. New regression asserts the failure stage is surfaced.
- Chrome OCR import fix (D26): ocr.js now imports the vendored bundle by its real default
  export instead of a nonexistent named `createWorker`. New regression (ocr-import.test.mjs,
  2 entries) links the bundle the way Chrome does and fails if that SyntaxError ever returns.
- Build, JS syntax, manifest and packaged asset integrity checks pass; see TESTING checkpoint.
- Real Node/WASM smoke: 11 synthetic lines recognized, one test-region line withheld,
  10 safe lines retained including Continue; known demo PII absent.

REMAINING:
- User Chrome checks P4-M1 through P4-M10 and real browser harness.
- Phase 5: spatial DOM/visual fusion into a sanitized structured UI state.
- Phase 6 planner; 7 safe actions; 8 re-observe/verify; 9 metrics; 10 polish.

KNOWN LIMITS:
English text baseline, not ViT/object detection. Whole-line overlap may withhold nearby
safe text; simple text rules do not guarantee detection of unknown PII. No screenshot resizing; images over 20 MP are rejected
for OCR only. Chrome behavior/latency not yet measured; browser automation reported no surfaces.

NEXT EXACT TASK:
Verify the import fix in real Chrome. User reloads the extension (chrome://extensions →
EdgeSight → Reload), runs one ANALYZE on the demo, and confirms the offscreen/service-worker
consoles no longer show the `does not provide an export named 'createWorker'` SyntaxError and
that LOCAL VISUAL PERCEPTION now initializes. If a NEW `[EdgeSight OCR] …` stage error appears
(e.g. OCR_CORE_LOAD / OCR_LANGUAGE_LOAD / OCR_RECOGNIZE / OCR_TIMEOUT), that is a separate
second bug — report it and debug it next. Do NOT mark Chrome OCR PASSED until the user confirms.
Phase 5 (DOM + visual fusion) remains NOT STARTED — do not begin it until Chrome OCR is verified.

LAST UPDATED:
2026-09-10 — Phase 4 Chrome OCR root cause found + fixed (D26: vendored bundle is default-export
only; ocr.js now imports it correctly). Awaiting user's Chrome reload to verify.
