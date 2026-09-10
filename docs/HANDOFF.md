# EdgeSight — Handoff

## State

Phase 4 implemented; Phase 5 not started. The browser-local OCR/CV baseline uses Tesseract.js
6.0.1 + core 6.1.2 + English data 1.0.0. Do not call it a ViT. Real Node/WASM synthetic
inference passed; actual Chrome engine/capture/offline/overlay checks remain UNVERIFIED.

The user reported Phase 3's manual test passed and the privacy display shows sensitive
information. Do not convert this into unreported count, mask, SAFE, network or HiDPI passes.
Exact evidence and historic Phase 1 confirmations are preserved in TESTING.md.

## Repository and run

`main`, tracking `origin/main`. Phase 4 commit subject:
`feat: add browser-local visual perception`. Final report records hash/push verification.
Use `git log -1` and `git rev-parse HEAD origin/main` to inspect current state.

Reload unpacked `extension/` in Chrome 116+. Assets are already packaged: npm is not needed
for the demo. Enable file URL access, open `demo-page/index.html`, keep all seven fields
visible and ANALYZE PAGE. Inspect OCR status, text, boxes, confidence, timing and overlay.
First initialization can take longer; deadline is 45 seconds. Repeated runs within two
minutes reuse the worker. The worker is disposed after two minutes idle or any host failure.

Development: `npm ci --ignore-scripts --no-audit --no-fund`, `npm run build`, `npm test`,
`npm run check`. Build copies pinned assets/licenses and writes SHA-256 inventory. No
node_modules/cache/temp images are committed. The data package has differing npm MIT
metadata/upstream Apache-2.0 data licensing, explicitly recorded in vendor/ocr/README.md.

Browser harness: `chrome-extension://<id>/tests/ocr-browser.html` → Run cold / warm OCR test.
This actually invokes browser Tesseract on Canvas-generated, Phase-3-masked synthetic pixels.
It has not been run here: browser automation reported no enabled browser surfaces. Use the
separate P4-M1–M10 manual procedure for the actual demo, offline/network and failure checks.

Genuine Node smoke: `node scripts/smoke-ocr.mjs <local-synthetic-PNG>`; it is not Chrome proof.
The previous run recognized 11 lines, confidence .95–.96. Cold init/inference/total:
758.37/500.52/1258.90 ms; warm inference/total 289.97 ms. See TESTING for scope and reproduction.

## Code boundaries

- Phase 1–3 observer/classifier/geometry/semantic pipeline remains intact.
- `privacy/redact.js`: private sanitized-image registry and outbound builder. The new
  accessor rejects raw strings/forged handles. Optional visual output is separately guarded.
- `perception/pipeline.js`: sanitized capability → local inference → visual output sanitizer.
- `perception/bridge.js`: MV3 offscreen creation/messaging, 45-second timeout, host cleanup.
- `perception/offscreen.*`: packaged worker host; no page DOM access; sender checks, busy state.
- `perception/ocr.js`: PNG bytes only, explicit local URLs, LSTM English, sparse-text mode.
- `perception/normalize.js`: line boxes, actual confidence / 100, timings and schema.
- `privacy/visual.js`: known-value guard before/after normalization, conservative safe words.
- `popup/`: actual safe OCR output and local Canvas box overlay; no expected-item checkmarks.
- `vendor/ocr/`: about 11.1 MB runtime/data/licenses and hash inventory.

Raw screenshots never enter OCR. Raw known-value strings stay in the worker privacy
transaction until output checking and are dropped in finally, never OCR/popup/log/storage.
OCR data is untrusted. An UNSAFE result revokes candidate safeContext and previews while
retaining safe structural counts. Ordinary OCR errors leave Phase 1–3 context available.
Future transport must consume only guarded safeContext, never the full local response.

CSP adjustment: `wasm-unsafe-eval` for local WASM; `worker-src 'self'`; connect-src changes
from none to self + data: for extension-local traineddata and embedded-WASM reads. No remote origins, blob worker,
unsafe-eval, broad hosts or script relaxations. Added offscreen permission only.

## Limits and next task

No actual Chrome verification/latency claim yet. English OCR only, conservative word
allowlist, uncertain accuracy on small fonts, no PII/object/face recognition guarantee,
no resizing (20 MP cap), no atomic DOM+capture guarantee. Warm WASM may retain last
sanitized image in engine memory until reuse/disposal. No secure JS memory-erasure claim.
A future quantized ViT/ONNX detector can replace this engine behind the same image-input,
normalized-box/output-guard interface; none is integrated now.

Next exact task: Phase 5 — spatially match OCR text/boxes with DOM field/action geometry
and assemble a sanitized structured UI state, preserving privacy guards. No planner/actions.
