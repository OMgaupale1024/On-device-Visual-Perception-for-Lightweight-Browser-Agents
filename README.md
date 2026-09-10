# EdgeSight

**Privacy-preserving on-device perception layer for lightweight browser agents.**

Smart India Hackathon 2026 · SIH26171 · ISRO · Software · Smart Automation.

**Phase 4 implemented. Phase 5 not started.** EdgeSight now runs a **browser-local
OCR/CV perception baseline** over sanitized screenshot pixels using Tesseract.js 6.0.1,
WASM core 6.1.2 and packaged English data. This is OCR, not a Vision Transformer.

Real Tesseract/WASM inference passed on a synthetic image under Node. Actual Chrome
MV3 inference, offline operation and demo recognition still require manual verification.
The user reported the Phase 3 manual test passed and sensitive information appeared in
the privacy display; only that specific report is recorded in [Testing](docs/TESTING.md).

## Run locally

1. Reload/load unpacked `extension/` at `chrome://extensions` (Chrome 116+).
2. Enable Allow access to file URLs and open `demo-page/index.html` (fake data only).
3. Keep all seven fields visible; open EdgeSight and click **ANALYZE PAGE**.
4. Inspect Local visual perception and expand detected text/positions and local previews.

All OCR runtime assets are committed under `extension/vendor/ocr/`; loading the extension
requires no npm install and no runtime download. Engine processing has a 45-second deadline.
The popup displays actual OCR output, confidence, boxes, cold/warm timing, and a local box
overlay. Unknown OCR lines are withheld by the prototype output policy; missing text is
never fabricated or replaced with DOM text. Empty and error states are explicit.

## Privacy order

```text
local raw screenshot → Phase 3 field masks → private sanitized-image handle
→ local OCR worker (PNG bytes only) → output sanitizer + known-value guard
→ safe visual result, separate from DOM semantics (Phase 5 fusion later)
```

Raw field-value strings never reach OCR or the popup. They stay temporarily in the trusted
worker for privacy checks. Raw screenshots cannot enter the OCR application gateway or
outbound builder. The original preview is local-only and always hides passwords. Previews
expire after 60 seconds, on re-analysis or close. Neither image is sent off-device.

Known sensitive OCR text makes the visual result UNSAFE: no OCR text, previews or candidate
outbound package are released. Ordinary OCR failures preserve Phase 1–3 results. All runtime
assets resolve to extension-local URLs; CSP permits self scripts/workers, self/data reads
and local WASM compilation. There is no remote transport, server, LLM, planner or action agent.

Expected demo OCR targets include Destination, Bengaluru, Purpose, Conference and Continue.
The static fake-data form is the supported prototype scope. Unknown PII, OCR errors,
shadow DOM/iframes, image-only secrets and complete arbitrary-site privacy are not solved.

## Development and tests

- `npm ci --ignore-scripts --no-audit --no-fund` (development dependency download only).
- `npm run build`: package the pinned runtime, embedded-WASM cores, English data and licenses.
- `npm test`: pure logic, API-double integration and Phase 1–3 regressions.
- `npm run check`: syntax, manifest and packaged asset SHA-256 checks.
- Real browser harness: `chrome-extension://<id>/tests/ocr-browser.html`.
  Browser checks remain UNVERIFIED; see the exact [test plan](docs/TESTING.md).

`node_modules`, caches and temporary test images are ignored and not committed. The genuine
Node/WASM smoke result is documented separately from the unrun Chrome harness.

[Architecture](docs/ARCHITECTURE.md) · [Progress](docs/PROGRESS.md) ·
[Decisions](docs/DECISIONS.md) · [Handoff](docs/HANDOFF.md) ·
[OCR assets and licenses](extension/vendor/ocr/README.md)

Next: **Phase 5 — spatial DOM/visual fusion into a sanitized structured UI state.**
Later: Phase 6 planner, 7 safe actions, 8 re-observe/verify, 9 metrics, 10 polish.
