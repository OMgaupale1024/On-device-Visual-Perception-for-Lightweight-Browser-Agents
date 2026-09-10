# EdgeSight — Progress

CURRENT PHASE:
Phase 5 COMPLETE IN CODE: local fusion of safe DOM semantics + safe visual OCR into one
privacy-guarded SafeAgentContext (schemaVersion 1), with a final fail-closed gate over the
serialized structure and observation-scoped ids. Sensitive fields become [ROLE] placeholders;
non-sensitive safe values kept; sanitized image is metadata only (bytes stay behind the handle).
No network/server/LLM/browser actions. Phase 4's Chrome OCR import fix is applied but its Chrome
run is STILL user-pending — Phase 4 (Chrome) and Phase 5 are both NOT yet Chrome-verified. Phase 6 not started.

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
- 71/71 automated test entries pass, including Phase 1–4 regressions and 7/7 detection assertions.
- Phase 5 SafeAgentContext (D27): privacy/agent-context.js fuses safe semantic + safe visual state
  into a canonical, guarded, frozen structure; separate DOM/visual provenance; redaction legend;
  image metadata only. Final gate = recursive guard + serialized-bytes scan, fail closed. Goal is
  validated untrusted text. Wired into the service worker; popup shows a Phase 5 summary + preview.
  agent-context.test.mjs (12 entries) covers construction, guard fail-closed, and §25 contamination.
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
- User Chrome checks: P4-M1..M10 (OCR) and P5 (SafeAgentContext panel shows READY, obs id,
  placeholders, ~2 KB size) in real Chrome. Real browser harness.
- Phase 6 planner + privacy-safe server transport (consumes agentContext ONLY); 7 safe actions;
  8 re-observe/verify; 9 metrics; 10 polish.

KNOWN LIMITS:
English text baseline, not ViT/object detection. Whole-line overlap may withhold nearby
safe text; simple text rules do not guarantee detection of unknown PII. No screenshot resizing; images over 20 MP are rejected
for OCR only. Chrome behavior/latency not yet measured; browser automation reported no surfaces.

NEXT EXACT TASK:
Phase 6 — privacy-safe server transport + planner. DO NOT START until reviewed and until the
user has Chrome-verified Phases 4–5. When it begins, Phase 6 must consume the Phase 5
`agentContext` ONLY, obtain the sanitized image solely through the redact.js handle path, and
preserve the final gate + contamination tests. No LLM/VLM, API keys, browser actions, metrics
dashboard or Pi in Phase 6's first step. First, the user reloads the extension and confirms in
Chrome: OCR initializes (no createWorker SyntaxError) AND the Safe agent context panel shows
Status READY, an obs_ id, [ROLE] placeholders, and a small structured size.

LAST UPDATED:
2026-09-10 — Phase 5 complete in code (D27: canonical SafeAgentContext = safe DOM + safe visual
fusion, final fail-closed gate, image metadata only). 71/71 tests pass. Chrome verification of
Phases 4–5 still user-pending. Phase 6 NOT started.
