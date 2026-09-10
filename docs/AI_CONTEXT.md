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
- **Phase 4 — Visual perception: CODE COMPLETE; Chrome root cause FIXED, NOT yet Chrome-verified.** Real pixel OCR, safe visual items, boxes/confidence, local assets and debug UI; Node/WASM passes. Chrome had errored on a load-time ESM SyntaxError (named `createWorker` import vs the vendored bundle's default-only export); import corrected (D26), awaiting the user's Chrome reload.
- **Phase 5 — Safe agent context: COMPLETE IN CODE, NOT yet Chrome-verified.** Local fusion of safe DOM semantics + safe visual OCR into one canonical, privacy-guarded SafeAgentContext (schemaVersion 1); observation-scoped ids; sensitive fields as `[ROLE]` placeholders; image metadata only; final fail-closed gate. No network/server/LLM/actions (D27).

## Current Phase

**Phase 5 — Safe agent context. Status: COMPLETE IN CODE, NOT yet Chrome-verified.** Local
fusion is implemented, tested and documented; stopped for review + the user's Chrome reload.
Phase 4's Chrome OCR import fix is also still awaiting the user's Chrome confirmation. No Phase 6
authorization or implementation is implied by this handoff.

### Phase 5 — SafeAgentContext (this session)

- **What shipped:** `extension/src/privacy/agent-context.js` —
  `buildSafeAgentContext({goal, semantic, visualState, image, observation, sensitiveValues})`,
  `serializeSafeAgentContext`, `validateGoal`. It consumes ONLY already-safe inputs, whitelists
  keys (never spreads), reuses `guard.js`, and emits a frozen schemaVersion-1 context:
  `observation{id,capturedAt,viewport,image{w,h,redactedRegions},coordinateSystem}`, `goal`,
  `privacy{status,sensitiveFieldCount,redactedRegionCount,rawPiiIncluded:false}`, `fields[]`
  (`source:"semantic"`), `visualElements[]` (`source:"visual"`, bbox + confidence + `visual_N`),
  `redactionScheme`.
- **Privacy model:** image is METADATA ONLY (no `dataUrl`); sanitized bytes stay behind the
  `redact.js` handle. Final local gate = `checkOutbound` (nested, keys+values) + a scan of the
  exact serialized bytes; either hit ⇒ `{status:"BLOCKED"}` (generic reason). Upstream OCR-UNSAFE
  ⇒ context REVOKED. Goal is validated untrusted text (≤500 chars, never executed).
- **Wiring:** the service worker mints `obs_<uuid>` + `capturedAt`, passes the popup's goal, and
  builds the context in its own try (a builder fault never discards Phase 1–4 results); response
  adds `agentContext`, `agentContextStatus`, `structuredContextBytes`, `sanitizedImageBytes`.
  The popup shows a "Safe agent context" panel + a preview of the SAME object (no mock, no PII).
- **Deferred:** `visualRefs` (optional semantic↔visual links) — needs cross-coordinate-space
  matching; schema stays forward-compatible.
- **Status:** 71/71 Node tests pass; a representative demo context is ~2.2 KB. Chrome (P5-M0)
  UNVERIFIED. Do NOT begin Phase 6 until reviewed and Chrome-verified.

### Phase 4 Chrome OCR failure — root cause found + fixed (still Chrome-pending)

- **Symptom (user-observed, real Chrome):** LOCAL VISUAL PERCEPTION showed Status: ERROR,
  "Local OCR unavailable or timed out." Phases 1–3 still worked (5 regions redacted,
  Visual/Semantic Sanitized, Outbound SAFE). The Chrome console showed the true error:
  `Uncaught SyntaxError: The requested module '.../tesseract.esm.min.js' does not provide an
  export named 'createWorker'`, thrown before OCR initialization.
- **Exact root cause (IDENTIFIED):** `ocr.js` used a NAMED import,
  `import { createWorker } from '.../tesseract.esm.min.js'`, but the vendored Tesseract.js
  6.0.1 browser bundle exposes only a default export (`export { tesseract_min as default }`);
  `createWorker` is a property of that default object. Named-import binding is resolved during
  ESM *linking*, before evaluation, so the module never ran — which is exactly why the D25
  runtime diagnostics never fired and why the "timed out" message was misleading.
- **Why Node passed but Chrome failed (corrected):** the earlier worker_threads-vs-Web-Worker
  / WASM / CSP hypothesis was WRONG. No Node test ever linked the vendored browser bundle:
  `smoke-ocr.mjs` imports `createWorker` from the `tesseract.js` PACKAGE (its Node build has
  the named export), and `perception.test.mjs` reads `ocr.js` as text. So the bad import shape
  was never exercised in Node. The statically-checked causes (asset URLs, worker slash-
  handling, `workerBlobURL:false`, CSP `wasm-unsafe-eval` + `connect-src 'self' data:`) were
  all genuinely correct — they just were not the fault.
- **Fix applied THIS session (D26):** `import Tesseract from '.../tesseract.esm.min.js';
  const { createWorker } = Tesseract;`. Engine, version, worker/core/lang paths, timeout, CSP
  and offscreen lifecycle are UNCHANGED (all were correct). No fake wrapper. New regression
  `extension/tests/ocr-import.test.mjs` links the bundle the way Chrome does and fails if the
  SyntaxError ever returns. The D25 diagnostics are retained.
- **Still UNVERIFIED:** every P4-M1–M10 Chrome check. Next Chrome run must confirm the
  SyntaxError is gone and OCR initializes; a NEW `[EdgeSight OCR] …` stage error would be a
  separate second bug.
- **DO NOT start Phase 6** until reviewed and until Phases 4–5 are browser-verified by the user.

## Work Completed This Session

Phase 5 (this session). Prior sessions (Phase 4 pixels/OCR, D23–D26; import fix) are in git + DECISIONS.

- Added `extension/src/privacy/agent-context.js`: `buildSafeAgentContext` / `serializeSafeAgentContext` / `validateGoal`. Pure module, reuses `guard.js`; whitelists keys; final fail-closed gate (structural guard + serialized-bytes scan). Image metadata only.
- Wired it into `service-worker.js`: mint `obs_<uuid>` + `capturedAt`, pass the popup's untrusted goal, build defensively, add `agentContext`/`agentContextStatus`/`structuredContextBytes`/`sanitizedImageBytes` to the response. Kept the existing `safeContext` (local preview package) intact.
- Popup: wired the existing goal input into the ANALYZE message (default goal updated to the travel-request demo goal); added a "Safe agent context" panel + a `<details>` preview of the same `agentContext` object.
- Added `extension/tests/agent-context.test.mjs` (12 entries, full §24 list + §25 contamination fail-closed); extended `background.test.mjs` with Phase 5 integration assertions.
- Documented D27; updated ARCHITECTURE/PROGRESS/HANDOFF/TESTING/README/AI_CONTEXT. No permissions, network, server, LLM or actions added.

## Current Working Behavior

Implemented ANALYZE PAGE path (Chrome acceptance is still pending):
1. Observe DOM, classify fields and temporarily collect values in the trusted local transaction.
2. Capture PNG; compare before/after state and active tab, blocking changed/unsupported captures.
3. Mask sensitive regions and build sanitized semantics through the Phase 3 boundary.
4. Run real English OCR on raw local PNG bytes; filter recognized lines after inference.
5. Return safe text/boxes/confidence/timing and draw safe boxes on the sanitized preview.
6. Preserve Phase 1–3 results on ordinary OCR errors; residual known-value leaks revoke visual/package/previews.
7. Fuse safe semantic + safe visual state into the guarded SafeAgentContext (image metadata only, observation-scoped ids, validated goal); a residual leak fails the gate closed (BLOCKED/REVOKED). Nothing is transmitted.

Genuine Node/WASM synthetic inference recognized all five targets: Destination, Bengaluru,
Purpose, Conference, Continue. Eleven lines were recognized; one test-region line was
withheld and ten retained. This proves real engine inference, not Chrome integration.

## Automated Tests

Phase 5 run, Node 24.11.0 on Windows:

| Command | Result | Passed | Failed |
|---|---|---|---|
| `npm test` (`node --test extension/tests/*.test.mjs`) | PASS | 71 test entries | 0 |
| `npm run check` | PASS: JS syntax, manifest, local asset hashes | all checks | 0 |
| `node scripts/smoke-ocr.mjs .browser-test/synthetic.png` | PASS: cold+warm real Node/WASM, all five targets, 1 line withheld | both runs | 0 |

12 entries are new (`agent-context.test.mjs`, D27): construction/schema/freeze, goal validation,
observation handling, safe-field/visual retention with provenance, redaction legend, no-raw-image,
byte measurement, malformed rejection, and §25 deliberate contamination (each fake secret via
goal/field/visual) → fail closed. `background.test.mjs` also now asserts the wired service worker
emits a READY `agentContext` and REVOKED on the OCR-UNSAFE path. These are Node results — NOT
Chrome proof of end-to-end OCR or the popup panel.

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
- P5-M0: in Chrome, the Safe agent context panel shows READY, an `obs_…` id, `[ROLE]` placeholders, Privacy check SAFE and a ~2 KB structured size; the preview shows the sanitized structure with no real PII. UNVERIFIED (Node tests only so far).
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
- D27: the canonical SafeAgentContext (`agent-context.js`) is the ONLY structure future transport may consume. It fuses safe DOM + safe visual state with clear provenance, carries image METADATA only (sanitized bytes only via the redact.js handle), and passes a final fail-closed gate. Do not inline the sanitized dataUrl, do not concatenate raw internal objects, do not let DOM text masquerade as pixel-recognized.

## Privacy Invariants

- Never transmit raw screenshot, password, known PII or the LOCAL-ONLY preview.
- Never log/persist raw sensitive values, raw OCR or raw screenshots; never put offending text into errors. Sanitized OCR diagnostics are the sole exception: only `perception/diagnostics.js` logs, and only a stage tag + error class + truncated library message — never page-derived content.
- Raw OCR stays in trusted local memory until filtered; no raw OCR strings reach popup/files/packages.
- Temporary field-value strings stay in collector/service-worker privacy work, not OCR-host input or popup. Pixel content may be recognized locally.
- All labels/DOM/OCR strings are untrusted. Final output must pass the recursive known-value guard; never bypass image-handle validation.
- Only genuine Phase 3 sanitized-image handles enter the outbound builder. Future transport must use the guarded Phase 5 `agentContext`, never the full local response; the sanitized image is obtained only via the handle path, never inlined in the context.
- The SafeAgentContext passes a final local gate (recursive guard + serialized-bytes scan) and fails closed; a contaminated candidate is BLOCKED (generic reason, no value echoed), an upstream OCR leak REVOKES it.
- Server must never receive arbitrary local selectors/secrets. No server exists yet.
- The original comparison preview is an intentional local-only PII-pixel exception: password is always masked; previews clear after 60 seconds/re-analysis/close. Use fake demo data only.

## Important Files

- `extension/src/background/service-worker.js` — capture/privacy/OCR orchestration and sender/busy checks.
- `extension/src/content/observe.js`, `privacy/detect.js`, `privacy/collect.js` (under `extension/src/`) — geometry/signals, value-free classification, separate temporary value collection.
- `extension/src/privacy/{geometry,redact,semantic,guard}.js` — mapping, private image handles/package builder, safe semantics, recursive guard.
- `extension/src/privacy/{visual,overlap}.js` — post-OCR filtering and sensitive intersection policy.
- `extension/src/privacy/agent-context.js` — Phase 5 canonical SafeAgentContext builder/serializer/goal-validator; final fail-closed gate; image metadata only (D27).
- `extension/src/perception/{ocr,normalize,pipeline,bridge,offscreen,cleanup,config,diagnostics}.js` — pixel engine, schema, privacy gateway, lifecycle, explicit local asset paths and the single sanitized diagnostics sink.
- `extension/manifest.json`, `extension/src/popup/`, `extension/vendor/ocr/` — security policy, local results UI, packaged runtime/licenses/hash inventory.
- `extension/tests/`, `scripts/smoke-ocr.mjs`, `scripts/package-ocr.mjs` — regressions, real Node engine harness, reproducible packaging.
- `docs/TESTING.md`, `docs/DECISIONS.md` — exact evidence/manual checklist and policy history. Read D23/D24 rather than superseded D21 alone.

## Git State

Checkpoint on 2026-09-10 (a committed file cannot contain its own hash — resolve live):

- Branch: `main`.
- Prior Phase 4 implementation commit: `84c342b57505d48b1e9effe55e81635a87eb05fc`.
- This session's HEAD is the Phase 5 commit (subject: `feat: add privacy-safe agent context`)
  — resolve its hash with `git log -1`. It adds `privacy/agent-context.js` +
  `agent-context.test.mjs`, wires the service worker and popup, and updates docs; the prior
  import fix (`fix: correct browser OCR module import`) and diagnostics commit are retained.
- Remote: `origin`, https://github.com/OMgaupale1024/On-device-Visual-Perception-for-Lightweight-Browser-Agents
- Working tree: clean after the diagnostics commit; pushed to `origin/main`.
- HEAD == origin/main: verify live with `git rev-parse HEAD origin/main`.

A committed file cannot contain its own commit hash. Resolve the current latest hash with
`git log -1` and this handoff's containing commit with `git log -1 -- docs/AI_CONTEXT.md`.
Before taking over, run status/branch/log, fetch, pull --ff-only and compare HEAD/origin/main;
do not treat this recorded snapshot as a fresh remote check.

## Exact Next Task

**Phase 6 — privacy-safe server transport + planner. DO NOT IMPLEMENT NOW.** First the user
must Chrome-verify Phases 4–5: reload EdgeSight, run one ANALYZE, confirm P4-M0 (OCR initializes,
no `does not provide an export named 'createWorker'` SyntaxError) and P5-M0 (Safe agent context
panel READY, `obs_…` id, `[ROLE]` placeholders, Privacy check SAFE, ~2 KB size). A new
`[EdgeSight OCR] …` stage error would be a separate second bug. Do not mark either PASSED until
the user confirms. When Phase 6 begins (after review + verification), it must consume the
`agentContext` ONLY, obtain the sanitized image solely via the redact.js handle, and preserve
the final gate + contamination tests. No LLM/VLM, API keys, browser actions, metrics or Pi.

## Do Not Break

- Phase 1 capture/observation and Phase 2 demo sensitive total of five (automated evidence).
- Phase 3 geometry/masks, safe semantics and mandatory image/guard boundary.
- Pixel-only OCR, actual boxes/confidence and graceful Phase 1–3 preservation on OCR failure.
- The Phase 5 SafeAgentContext: separate DOM/visual provenance, image metadata only (no inlined bytes), the final fail-closed gate, and the deliberate-contamination tests. Do not weaken them.
- Zero external application network behavior by design, packaged assets and restrictive CSP; runtime verification remains pending.
- Existing regression tests, user work, and honest manual evidence. No node_modules/caches/screenshots/secrets in commits; no force push.
- Keep AI_CONTEXT and HANDOFF current at architecture/blocker changes, before major work if stale, before phase commits and every session stop/model handoff.
- On takeover read README, ARCHITECTURE, PROGRESS, DECISIONS, HANDOFF, AI_CONTEXT and TESTING; inspect latest code/diff. Code + tests + Git history outrank summaries. Correct stale docs first.

## Planned Remaining Phases

- Phase 5 — visual + DOM fusion / safe context. **DONE in code (D27), Chrome-pending.**
- Phase 6 — privacy-safe server transport + planner (consumes `agentContext` only).
- Phase 7 — browser actions.
- Phase 8 — re-observation + verification.
- Phase 9 — SIH metrics.
- Phase 10 — demo polish.
