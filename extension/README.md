# EdgeSight extension

Phase 4 browser-local OCR/CV perception baseline: Tesseract.js 6.0.1 / core 6.1.2 / English
1.0.0. OCR consumes captured raw PNG pixels locally, then filters sensitive regions and text. It never reads observed DOM text.

Load/reload unpacked this folder in Chrome 116+. Runtime assets are committed in vendor/ocr;
no runtime npm/CDN/model download is required. Open the local fake-data demo and ANALYZE PAGE.
Inspect actual OCR text, confidence, boxes, timing and local overlay. Browser manual tests
remain UNVERIFIED. The user confirmed only a general Phase 3 manual pass/sensitive display.

From repo root: npm run build; npm test; npm run check.
Actual browser harness: chrome-extension://<id>/tests/ocr-browser.html.
[Architecture](../docs/ARCHITECTURE.md) · [Testing](../docs/TESTING.md) ·
[Assets/licenses](vendor/ocr/README.md). Phase 5 fusion is not implemented.
