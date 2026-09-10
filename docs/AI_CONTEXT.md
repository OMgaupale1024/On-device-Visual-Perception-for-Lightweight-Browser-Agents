# EdgeSight AI Context

## Project

EdgeSight

SIH26171 — On-device Visual Perception for Light-weight Browser Agents

Organisation: ISRO

Prototype deadline stated by user: September 11. Checkpoint: 2026-09-10.

## Root Objective

A browser-local vision/privacy agent that:

- reads the current screen locally
- detects sensitive/PII information locally
- sanitizes it before network transmission
- sends only safe context to a server
- receives structured actions
- executes them locally
- re-observes and verifies the result

Only local observation/privacy/perception exists through Phase 4. Server, actions and
verification loop above are future work, not current capabilities.

## Current Architecture

```text
Browser screen → local DOM observation + value-free classification → sensitive CSS boxes
Browser screen → captureVisibleTab raw PNG
  → local Canvas redaction → private sanitized-image handle
  → local offscreen Web Worker OCR on RAW PNG bytes → untrusted raw OCR
     → normalization → scaled sensitive-box overlap + text privacy filtering → safe visual state
Safe semantics + sanitized-image handle + separate safe visual state
  → mandatory privacy guard/package builder → local popup and sanitized box overlay
Future: Phase 5 fusion → guarded server context → actions → re-observation/verification
```

Both image branches start from the captured PNG; OCR never reads DOM text. Redaction
runs first operationally to measure PNG dimensions, but OCR receives unchanged raw pixels.
`safeContext.visual` is separate from DOM semantics; full fusion is not implemented.
There is no application network transport, server, LLM or browser action implementation.

## Completed Phases

- **Phase 0 — Foundation: COMPLETE.** Repository, docs and Git workflow.
- **Phase 1 — Observation: COMPLETE.** MV3 popup, DOM observation, visible-tab capture and fake demo.
- **Phase 2 — Sensitive detection: COMPLETE.** Signal-only name/email/phone/employee-ID/password classification.
- **Phase 3 — Privacy: COMPLETE IN CODE.** Geometry, pixel mapping, masks, safe semantics and guarded image packaging; detailed manual checks pending.
- **Phase 4 — Visual perception: COMPLETE IN CODE.** Real pixel OCR, safe visual items, boxes/confidence, local assets and debug UI; Chrome acceptance pending.

## Current Phase

**Phase 4 — Browser-local visual perception. Status: COMPLETE IN CODE.**
Stopped for review. No Phase 5 authorization or implementation is implied by this handoff.

## Work Completed This Session

- Phase 4 checkpoint `84c342b`: changed OCR input to local raw captured pixels per revised user instructions.
- Added post-inference sensitive-region overlap filtering, known-value and obvious-PII removal; removed the fixed OCR output vocabulary.
- Added blank-raster replacement/input cleanup while retaining a warm model, plus bounded local service-worker activity during OCR.
- Extended normalization, popup timing, integration/privacy tests and real-engine harnesses; updated architecture and manual procedures.
- This documentation follow-up: added AI_CONTEXT, linked takeover/maintenance instructions, reran tests/checks and corrected stale manifest description text. No runtime logic changed in the follow-up.

## Current Working Behavior

Implemented ANALYZE PAGE path (Chrome acceptance is still pending):
1. Observe DOM, classify fields and temporarily collect values in the trusted local transaction.
2. Capture PNG; compare before/after state and active tab, blocking changed/unsupported captures.
3. Mask sensitive regions and build sanitized semantics through the Phase 3 boundary.
4. Run real English OCR on raw local PNG bytes; filter recognized lines after inference.
5. Return safe text/boxes/confidence/timing and draw safe boxes on the sanitized preview.
6. Preserve Phase 1–3 results on ordinary OCR errors; residual known-value leaks revoke visual/package/previews.

Genuine Node/WASM synthetic inference recognized all five targets: Destination, Bengaluru,
Purpose, Conference, Continue. Eleven lines were recognized; one test-region line was
withheld and ten retained. This proves real engine inference, not Chrome integration.

## Automated Tests

Fresh documentation-follow-up run, Node 24.11.0 on Windows:

| Command | Result | Passed | Failed |
|---|---|---|---|
| `npm test` (`node --test extension/tests/*.test.mjs`) | PASS | 56 test entries | 0 |
| `npm run check` | PASS: JS syntax, manifest, local asset hashes | all checks | 0 |

The suite includes Phase 1–3 regressions and the original 7/7 classifier assertions.
Earlier Phase 4 run: `npm run build` passed, packaging 18 runtime/data/license files,
11,090,774 bytes. `node scripts/smoke-ocr.mjs .browser-test/synthetic.png` passed genuine
Node/WASM cold/warm inference and geometry filtering. Measured totals: 746.38/189.87 ms,
including raster cleanup. These are historical Node timings, NOT browser timings.
See [TESTING.md](TESTING.md) for fixtures, detailed evidence and reproduction.

## Manual Verification

**VERIFIED — user-confirmed evidence only:**

- Historical Phase 1 M1–M4: extension loads, popup opens, Analyze returns counts, capture Ready with real resolution (recorded in TESTING).
- User reported Phase 3 manual test passed and sensitive information appeared in privacy display. No specific count, mask alignment or network claim was confirmed.

**PENDING:**

- Detailed Phase 3 masks, five-field count, preserved Destination/Purpose pixels, zoom/HiDPI and network checks.
- All P4-M1–M10: actual Chrome OCR/Continue recognition, safe output, boxes, timing, offline/local assets, zero external requests, repeat analysis and failure isolation.
- Browser harness, popup-close/timeout recovery and lifecycle behavior. No enabled browser automation surface was available during Phase 4 work.

## Known Problems / Limitations

- No known automated failure; actual Chrome execution and latency remain unverified.
- English OCR baseline, not general UI/object perception; small-font accuracy is uncertain, with no measured font-size threshold.
- Whole-line overlap filtering can remove nearby safe text. Unknown names, transformed secrets and OCR errors can evade text heuristics.
- Image masks cover known visible DOM fields only; OCR text rules do not add image masks for unknown pixel PII.
- No iframe/shadow-root traversal; pinch-zoom/panned viewports rejected. Before/after snapshots are not atomic capture.
- OCR rejects images over 20 MP; no resize. JS/WASM cleanup is not secure memory erasure.
- Server, planner, actions and fusion are absent by design, not broken features.

## Important Decisions

- Chrome MV3, minimum Chrome 116; one browser-local OCR/CV baseline, never advertised as a ViT.
- Pin Tesseract.js 6.0.1, core 6.1.2, English data package 1.0.0. Runtime/worker/two embedded-WASM LSTM cores/data/licenses are extension-local; no runtime CDN/cache download.
- D23 supersedes D21: raw pixels MAY enter local OCR; safe results are produced afterwards. Do not restore sanitized-input-only or a fixed output word list accidentally.
- DOM classifier remains value-free. DOM geometry is post-inference privacy metadata, never recognition text or fallback.
- Scale CSS boxes using actual screenshot/viewport ratios independently per axis, round outward and clamp. Omit any OCR line intersecting a sensitive rectangle plus two image pixels.
- Visual IDs are observation-scoped; preserve boxes and ID gaps after filtering. Confidence is actual engine 0–100 divided by 100; invalid/missing becomes null.
- Offscreen page owns one reusable OCR worker; 45-second budget, 120-second idle disposal. Replace raster with a blank and unlink /input after inference. Local getContexts activity every 10 seconds exists only during the pending transaction.
- Keep local-only CSP: self scripts/workers, wasm-unsafe-eval, self/data connections. No remote origins or broad permissions.
- Quantized ViT/ONNX is a future interface-compatible upgrade; no large models, Pi or additional engines now.

## Privacy Invariants

- Never transmit raw screenshot, password, known PII or the LOCAL-ONLY preview.
- Never log/persist raw sensitive values, raw OCR or raw screenshots; never put offending text into errors.
- Raw OCR stays in trusted local memory until filtered; no raw OCR strings reach popup/files/packages.
- Temporary field-value strings stay in collector/service-worker privacy work, not OCR-host input or popup. Pixel content may be recognized locally.
- All labels/DOM/OCR strings are untrusted. Final output must pass the recursive known-value guard; never bypass image-handle validation.
- Only genuine Phase 3 sanitized-image handles enter the outbound builder. Future transport must use guarded safeContext, never the full local response.
- Server must never receive arbitrary local selectors/secrets. No server exists yet.
- The original comparison preview is an intentional local-only PII-pixel exception: password is always masked; previews clear after 60 seconds/re-analysis/close. Use fake demo data only.

## Important Files

- `extension/src/background/service-worker.js` — capture/privacy/OCR orchestration and sender/busy checks.
- `extension/src/content/observe.js`, `privacy/detect.js`, `privacy/collect.js` (under `extension/src/`) — geometry/signals, value-free classification, separate temporary value collection.
- `extension/src/privacy/{geometry,redact,semantic,guard}.js` — mapping, private image handles/package builder, safe semantics, recursive guard.
- `extension/src/privacy/{visual,overlap}.js` — post-OCR filtering and sensitive intersection policy.
- `extension/src/perception/{ocr,normalize,pipeline,bridge,offscreen,cleanup,config}.js` — pixel engine, schema, privacy gateway, lifecycle and explicit local asset paths.
- `extension/manifest.json`, `extension/src/popup/`, `extension/vendor/ocr/` — security policy, local results UI, packaged runtime/licenses/hash inventory.
- `extension/tests/`, `scripts/smoke-ocr.mjs`, `scripts/package-ocr.mjs` — regressions, real Node engine harness, reproducible packaging.
- `docs/TESTING.md`, `docs/DECISIONS.md` — exact evidence/manual checklist and policy history. Read D23/D24 rather than superseded D21 alone.

## Git State

Verified pre-documentation checkpoint on 2026-09-10 (not the hash of this file's later commit):

- Branch: `main`.
- Latest commit checked: `84c342b57505d48b1e9effe55e81635a87eb05fc` — Phase 4 implementation.
- Remote: `origin`, https://github.com/OMgaupale1024/On-device-Visual-Perception-for-Lightweight-Browser-Agents
- Working tree: clean at that checkpoint; this handoff update is the subsequent documentation commit.
- HEAD == origin/main: **yes at checkpoint**, also verified against live `git ls-remote`.

A committed file cannot contain its own commit hash. Resolve the current latest hash with
`git log -1` and this handoff's containing commit with `git log -1 -- docs/AI_CONTEXT.md`.
Before taking over, run status/branch/log, fetch, pull --ff-only and compare HEAD/origin/main;
do not treat this recorded snapshot as a fresh remote check.

## Exact Next Task

After Phase 4 review/authorization: **Phase 5 — combine safe DOM state and safe visual OCR
state into a canonical final sanitized agent context. Do not implement the server yet.**

## Do Not Break

- Phase 1 capture/observation and Phase 2 demo sensitive total of five (automated evidence).
- Phase 3 geometry/masks, safe semantics and mandatory image/guard boundary.
- Pixel-only OCR, actual boxes/confidence and graceful Phase 1–3 preservation on OCR failure.
- Zero external application network behavior by design, packaged assets and restrictive CSP; runtime verification remains pending.
- Existing regression tests, user work, and honest manual evidence. No node_modules/caches/screenshots/secrets in commits; no force push.
- Keep AI_CONTEXT and HANDOFF current at architecture/blocker changes, before major work if stale, before phase commits and every session stop/model handoff.
- On takeover read README, ARCHITECTURE, PROGRESS, DECISIONS, HANDOFF, AI_CONTEXT and TESTING; inspect latest code/diff. Code + tests + Git history outrank summaries. Correct stale docs first.

## Planned Remaining Phases

- Phase 5 — visual + DOM fusion / safe context.
- Phase 6 — server + planner.
- Phase 7 — browser actions.
- Phase 8 — re-observation + verification.
- Phase 9 — SIH metrics.
- Phase 10 — demo polish.
