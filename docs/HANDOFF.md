# EdgeSight — Handoff

## Current state

**Phase 3 complete. Phase 4 not started.** Phase 2 passed technical review. No new
manual checks were confirmed. Historic Phase 1 M1–M4 remain user-verified; Phase 1
M5–M8 and all Phase 2/3 popup checks remain pending as listed in TESTING.md.

ANALYZE PAGE observes/classifies visible DOM fields, captures the tab, checks snapshot
stability, masks sensitive rectangles locally, sanitizes semantics and guards a frozen
future outbound package. The popup shows privacy status plus collapsible ORIGINAL —
LOCAL ONLY / SANITIZED — SAFE CONTEXT previews. Passwords are masked in both; previews
clear after 60 seconds, on re-analysis or close. No server/network/LLM/OCR/CV/planner/
actions/Pi. Do not begin Phase 4 as part of this change.

## Repository and run

`main`, tracking `origin/main`.
https://github.com/OMgaupale1024/On-device-Visual-Perception-for-Lightweight-Browser-Agents

Phase 3 commit subject: `feat: add local visual redaction and privacy guard`.
Use `git log -1` and `git rev-parse HEAD origin/main` for hash/sync state. The task's
final report records actual push verification.

Reload unpacked `extension/`; enable Allow access to file URLs; open
`demo-page/index.html`. Keep all seven fields visible and ANALYZE PAGE.
Expected: 7/1/7 counts, 5 sensitive fields and masks, sanitized semantic/visual state,
SAFE guard, Destination/Purpose visible. Actual Chrome results remain UNVERIFIED.

Automated: `node --test extension/tests/*.test.mjs` (Node 24, no dependencies).
Real Canvas harness: `chrome-extension://<extension-id>/tests/redaction-browser.html`.
This uses synthetic pixels and no server. It has not been run. Follow TESTING.md and
record only actually confirmed checks.

## Code map

Paths relative to `extension/src/`:

- `content/observe.js`: value-free signals, stable IDs, CSS rectangles.
- `privacy/detect.js`: unchanged Phase 2 classifier.
- `privacy/collect.js`: separate temporary values and repeated-sensitive-text block.
- `privacy/geometry.js`: measured scaling, rounding/clamping.
- `privacy/semantic.js`: placeholders and demo vocabulary, untrusted labels omitted.
- `privacy/guard.js`: recursive JSON/key guard with generic failure.
- `privacy/redact.js`: Canvas masks, private handles, frozen package gateway.
- `background/service-worker.js`: orchestration, stability, cleanup; no transport.
- `popup/`: local privacy results/previews.
- `extension/tests/` (repo-relative): unit/regression tests and browser pixel harness.

## Preserve these boundaries

Classifier/observer never read values. Only collector and trusted worker privacy work
handle raw strings; never popup/logs/errors/storage/files/transmission. All labels/text
are untrusted until sanitized. Future goals/action labels must pass the same gateway.

The raw screenshot cannot enter buildOutboundPackage; only redaction mints its private
sanitized-image handle. The original preview is a separate local-only sibling. Future
Phase 6 transport must consume only guarded safeContext, never the full response.
Keep activeTab/scripting permissions, value-free detection, network CSP and tests intact.

## Known limits

Chrome visual alignment and runtime zero-network observation await manual checks.
Node Canvas doubles are not pixel proof. The supplied browser harness is UNVERIFIED.
Masks cover detected visible standard DOM fields; no unknown PII recognition in arbitrary
text/images/canvas/iframes/shadow DOM. Pinch zoom blocks. Snapshot checks cannot eliminate
every transient race. JS cleanup is not secure memory wiping. Use the static fake-data demo.

## Next exact task

Phase 4 — core on-device visual perception over captured pixels.
