# EdgeSight — Handoff

## Claude / Codex takeover protocol

Start with [AI_CONTEXT.md](AI_CONTEXT.md), the concise shared state maintained for both AIs.
Before coding: run git status, git branch, git log --oneline -10, git fetch and
git pull --ff-only. Read README, ARCHITECTURE, PROGRESS, DECISIONS, HANDOFF, AI_CONTEXT
and TESTING; inspect the latest commit/diff and relevant implementation. Code, test
results and Git history are the source of truth when a summary disagrees.

Update AI_CONTEXT before major work if stale, after decisions/blocker changes, before
phase-completing commits, every session stop and any Claude/Codex handoff. Before stopping:
run tests, update docs/HANDOFF/AI_CONTEXT, inspect status/diff, commit, push normally,
verify HEAD == origin/main and clean working tree, report the hash, then stop. Record only
manual checks explicitly confirmed by the user. Do not start a later phase automatically.

Chrome OCR import-fix checkpoint: 59/59 test entries pass; syntax, manifest and asset checks
pass; the Node/WASM smoke re-passed cold+warm. Root cause of the Chrome failure was IDENTIFIED
and FIXED this session (D26): ocr.js imported a named `createWorker` the vendored default-only
Tesseract bundle never exported, so Chrome threw a load-time ESM SyntaxError before any OCR ran
(which is why the D25 runtime diagnostics never fired). Import corrected; a new regression
(ocr-import.test.mjs) guards the contract. Phase 4 is code-complete; NOT yet Chrome-verified —
next step is the user's Chrome reload to confirm OCR now initializes.

## State

Phase 4 code-complete; Chrome root cause FIXED in code but NOT yet Chrome-verified; Phase 5
NOT started. The browser-local OCR/CV baseline uses Tesseract.js 6.0.1 + core 6.1.2 + English
data 1.0.0. Do not call it a ViT. Real Node/WASM synthetic inference passes. In Chrome, LOCAL
VISUAL PERCEPTION had errored ("Local OCR unavailable or timed out") while Phases 1–3 passed;
the Chrome run showed the actual cause was a load-time ESM SyntaxError — ocr.js imported a
named `createWorker`, but the vendored bundle exports only a default (createWorker is a
property of it). It was NOT runtime-only, which is why the statically-checked causes (asset
URLs, worker slash-handling, workerBlobURL=false, CSP) were all fine and the D25 diagnostics
never fired. The import is corrected (default import + destructure; D26) and guarded by
ocr-import.test.mjs. Next Chrome run must confirm the SyntaxError is gone and OCR initializes;
any new `[EdgeSight OCR] …` stage error is a separate second bug. Do NOT begin Phase 5 until
Chrome OCR is fixed and user-verified.

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
This invokes browser Tesseract on raw synthetic Canvas pixels, filters a test sensitive
region afterwards, and displays only safe boxes over a separately masked preview.
It has not been run here: browser automation reported no enabled browser surfaces. Use the
separate P4-M1–M10 manual procedure for the actual demo, offline/network and failure checks.

Genuine Node smoke: `node scripts/smoke-ocr.mjs <local-synthetic-PNG>`; it is not Chrome proof.
The revised smoke recognized 11 lines, withheld one synthetic sensitive-region line,
and retained 10 safe lines, including Continue. Cold total 746.38 ms; warm total 189.87 ms
(including raster cleanup). See TESTING for scope; these are NOT Chrome timings.

## Code boundaries

- Phase 1–3 observer/classifier/geometry/semantic pipeline remains intact.
- `privacy/redact.js`: private sanitized-image registry and outbound builder. The new
  accessor rejects raw strings/forged handles. Optional visual output is separately guarded.
- `perception/pipeline.js`: raw local image → inference → geometry/text output sanitizer.
- `perception/bridge.js`: MV3 offscreen creation/messaging, 45-second timeout, host cleanup.
- `perception/offscreen.*`: packaged worker host; no page DOM access; sender checks, busy state.
- `perception/ocr.js`: PNG bytes only, explicit local URLs, LSTM English, sparse-text mode.
- `perception/normalize.js`: line boxes, actual confidence / 100, timings and schema.
- `privacy/visual.js` + `overlap.js`: remove sensitive intersections/known values/obvious PII,
  then recursively guard safe items and check canonical known values across retained lines.
- `perception/cleanup.js`: replace retained raster with a blank PNG and unlink /input.
- `perception/diagnostics.js`: the ONLY source file that logs. Emits a stage tag + error
  class + truncated message to the console; never pixels, recognized text or secrets. All
  OCR-path modules route console output through it (D25).
- `popup/`: actual safe OCR output and local Canvas box overlay; no expected-item checkmarks.
- `vendor/ocr/`: about 11.1 MB runtime/data/licenses and hash inventory.

Raw screenshots enter ONLY extension-local OCR. Raw recognized text stays in the host and
service-worker privacy transaction; it never reaches popup/logs/files/storage/packages.
Explicit raw field-value strings stay in the service-worker privacy transaction until
output checking and are dropped in finally; they are never sent as text to the OCR host.
OCR data is untrusted. An UNSAFE result revokes candidate safeContext and previews while
retaining safe structural counts. Ordinary OCR errors leave Phase 1–3 context available.
Future transport must consume only guarded safeContext, never the full local response.

CSP adjustment: `wasm-unsafe-eval` for local WASM; `worker-src 'self'`; connect-src changes
from none to self + data: for extension-local traineddata and embedded-WASM reads. No remote origins, blob worker,
unsafe-eval, broad hosts or script relaxations. Added offscreen permission only.

## Limits and next task

No actual Chrome verification/latency claim yet. English OCR only, uncertain accuracy on
small fonts, no complete unknown-PII/object/face recognition guarantee, no resizing (20 MP
cap), no atomic DOM+capture guarantee. Whole-line overlap filtering can omit nearby safe
labels. Two-pixel padding is a prototype margin. Raw raster is replaced after every run;
the language model stays warm. No secure JS/WASM memory-erasure claim. The sanitized image
still masks known DOM fields only; text heuristics do not add masks for unknown pixel PII.
A future quantized ViT/ONNX detector can replace this engine behind the same image-input,
normalized-box/output-guard interface; none is integrated now.

Next exact task: VERIFY the import fix in real Chrome. The user reloads the extension
(chrome://extensions → EdgeSight → Reload), runs one ANALYZE on the demo, and confirms the
offscreen page and service-worker consoles no longer show `does not provide an export named
'createWorker'` and that LOCAL VISUAL PERCEPTION initializes. If a NEW `[EdgeSight OCR] …`
stage error appears (OCR_WORKER_CREATE / OCR_CORE_LOAD / OCR_LANGUAGE_LOAD / OCR_RECOGNIZE /
OCR_TIMEOUT), that is a separate second bug to debug next — one bug at a time. Do not mark
Chrome OCR PASSED until the user confirms. Only after Chrome OCR works: Phase 5 — DOM + visual
fusion and final sanitized structured agent context. Do not begin Phase 5 before Chrome is
verified. No planner/actions.
