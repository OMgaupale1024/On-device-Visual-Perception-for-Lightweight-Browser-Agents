# EdgeSight — Progress

CURRENT PHASE:
Phase 4 implementation complete. Browser acceptance checks pending. Phase 5 not started.

STATUS:
Browser-local OCR/CV perception baseline implemented with Tesseract.js 6.0.1, core 6.1.2,
English data 1.0.0. Genuine Node/WASM synthetic inference passed, including boxes/confidence.
Chrome MV3, actual demo recognition, offline operation and browser timing remain UNVERIFIED.

MANUAL EVIDENCE:
The user reported the Phase 3 manual test passed and sensitive information appeared in the
privacy display. No exact counts, individual masks, preserved pixels or network results were
confirmed. Detailed checks remain pending in TESTING.md. Historic Phase 1 M1–M4 are preserved.

COMPLETED:
- Phases 0–3 foundations, value-free detection, local capture/redaction and privacy guard.
- Packaged local OCR runtime/worker, embedded-WASM SIMD and non-SIMD LSTM cores, English data.
- Offscreen worker host, local-only CSP, warm worker reuse, idle disposal, 45-second timeout.
- PNG-only inference interface; no DOM text, selectors, labels or fallback inside OCR.
- Actual line boxes/confidence/timing normalization and conservative OCR output sanitizer.
- Known-value guard (including case/spacing variants); unsafe output revokes image package.
- Local text/details UI and bounding-box overlay; graceful OCR-only failure state.
- 49 automated test entries pass; build, syntax, asset hashes and regression checks pass.
- Real Node/WASM smoke: all 11 synthetic lines recognized; known demo PII absent.

REMAINING:
- User Chrome checks P4-M1 through P4-M10 and real browser harness.
- Phase 5: spatial DOM/visual fusion into a sanitized structured UI state.
- Phase 6 planner; 7 safe actions; 8 re-observe/verify; 9 metrics; 10 polish.

KNOWN LIMITS:
English text baseline, not ViT/object detection. Fixed output vocabulary withholds unknown
lines; no general privacy certification. No screenshot resizing; images over 20 MP are rejected
for OCR only. Chrome behavior/latency not yet measured; browser automation reported no surfaces.

NEXT EXACT TASK:
Phase 5 — spatially match OCR text/boxes with DOM field/action geometry and assemble a
sanitized structured UI state, preserving privacy guards. Do not implement planner/actions.

LAST UPDATED:
2026-09-10 — Phase 4 implemented; browser acceptance pending.
