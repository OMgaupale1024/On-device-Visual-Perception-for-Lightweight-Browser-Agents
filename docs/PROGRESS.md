# EdgeSight — Progress

CURRENT PHASE:
Phase 4 code complete but FAILING in real Chrome. Root cause not yet identified; stage
diagnostics added to expose it on the next Chrome run. Phase 5 not started.

STATUS:
Browser-local OCR/CV perception baseline implemented with Tesseract.js 6.0.1, core 6.1.2,
English data 1.0.0. Genuine Node/WASM synthetic inference passed, including boxes/confidence.
User-observed in real Chrome: LOCAL VISUAL PERCEPTION = ERROR ("Local OCR unavailable or
timed out"); Phases 1-3 still pass (5 regions redacted, Outbound SAFE). The failure was
swallowed at four catch layers with no logging. Static review verified every checkable
cause is CORRECT: worker/core/lang URLs resolve to real packaged files, the vendored worker
strips trailing slashes before appending filenames, workerBlobURL=false gives a same-origin
worker, and CSP already grants wasm-unsafe-eval + connect-src 'self'. So the fault is
runtime-only. Privacy-safe, stage-tagged diagnostics were added so one Chrome run names the
failing stage and real error class. Actual root cause, demo recognition, offline operation
and browser timing remain UNVERIFIED.

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
- 57/57 automated test entries pass, including Phase 1–3 regressions and 7/7 detection assertions.
- Stage-tagged, privacy-safe OCR diagnostics: a single audited sink (perception/diagnostics.js)
  logs only stage + error class/short message to the offscreen and service-worker consoles;
  every other source file stays log-free. New regression asserts the failure stage is surfaced.
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
Debug the Chrome OCR failure with the new diagnostics. User reloads the extension, runs one
ANALYZE on the demo, and reports the `[EdgeSight OCR] …` lines from the offscreen page console
and the service-worker console (chrome://extensions → EdgeSight → Inspect views). The last
stage before the error names the failing component (OCR_WORKER_CREATE / OCR_CORE_LOAD /
OCR_LANGUAGE_LOAD / OCR_RECOGNIZE / OCR_TIMEOUT). Then apply the targeted fix.
Phase 5 (DOM + visual fusion) remains NOT STARTED — do not begin it until Chrome OCR is verified.

LAST UPDATED:
2026-09-10 — Phase 4 Chrome OCR failing; stage diagnostics added to localize the fault.
