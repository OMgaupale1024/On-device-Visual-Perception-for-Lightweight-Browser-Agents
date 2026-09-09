# EdgeSight — HANDOFF (emergency recovery)

> If a session (Claude / Codex / developer) ends suddenly, read this file first, then
> `PROGRESS.md`. Update this file at the end of EVERY phase.

## Current working state

Phase 2 complete and **pushed**. EdgeSight is a loadable Chrome **MV3 extension**. On
**ANALYZE PAGE** it: observes the active tab's DOM (counts inputs/buttons/labels + per-field
structural signals), runs local sensitive-field **detection** (classifies each field's role
*without reading values*), and captures the visible-tab pixels locally. The popup shows counts,
a **sensitive checklist + total**, and the capture resolution. **No redaction/guard, no server,
no AI, no OCR yet** — those are Phase 3+.

Phase 1 manual checks **M1–M4 were verified by the user on 2026-09-10** (M5–M8 pending) — see
`TESTING.md`.

## Current branch

`main`, tracking `origin/main`. History: Initial → Phase 0 foundation → Phase 0 docs → Phase 1 →
Phase 2. Repo:
https://github.com/OMgaupale1024/On-device-Visual-Perception-for-Lightweight-Browser-Agents

## Latest useful commit

The Phase 2 commit on `main` (pushed). Verify with `git log --oneline -3`.

## How to run — extension

`chrome://extensions` → Developer mode → Load unpacked → `extension/`, then click the toolbar icon.

## How to run — demo page

Open `demo-page/index.html` in Chrome. If ANALYZE errors on `file://`, enable "Allow access to
file URLs" for EdgeSight (chrome://extensions → Details), or serve via `python -m http.server` in
`demo-page/`.

## How to run tests

`node extension/tests/detect.test.mjs`  — 7 pure unit tests, no browser needed.

## How ANALYZE PAGE works

Popup sends `{type: ANALYZE_PAGE}` → background service worker:
1. `chrome.tabs.query` → active tab.
2. `executeScript({func: observePage})` → `{ title, counts, viewport, dpr, fieldSignals }`
   (**signals only — no field values**).
3. `detectSensitiveFields(fieldSignals)` → `[{ id, role, sensitive, label }]`; the raw signals are
   then **dropped** (never reach the popup).
4. `captureVisibleTab` → `createImageBitmap` → `{ width, height }`; the image is dropped.
5. returns `{ ok, observation: { counts, fields, sensitiveCount, ... }, capture }` → popup renders.

## Files (Phase 1 + Phase 2)

```
extension/
  manifest.json                     MV3; permissions: activeTab + scripting
  src/shared/messages.js            MSG.ANALYZE_PAGE
  src/content/observe.js            observePage() — self-contained; returns signals (Phase 2: + fieldSignals)
  src/privacy/detect.js             NEW — pure classifyField / detectSensitiveFields / countSensitive
  src/background/service-worker.js  orchestrates observe + detect + capture
  src/popup/popup.html|css|js       UI + sensitive section
  tests/detect.test.mjs             NEW — node test suite
demo-page/  index.html style.css script.js   Employee Travel Request (FAKE data) + success state
```

## Environment requirements

Chrome (MV3). Node 24 for tests. Python 3.10 only later (server, Phase 6).

## Known browser restrictions

- `activeTab` granted only on user gesture (opening the popup) — ANALYZE is user-initiated.
- Restricted pages (`chrome://`, Web Store) can't be observed/captured → graceful error.
- `file://` pages need "Allow access to file URLs" enabled for the extension.
- `captureVisibleTab` returns device-pixel dimensions (HiDPI → larger than CSS viewport).

## Known bugs

- None in the extension code. The dev automation harness times out on screenshots (harness issue,
  unrelated to EdgeSight).

## Incomplete work

Phase 3+ (see PROGRESS.md → REMAINING): redaction, outbound privacy guard, local visual perception
(**core Phase 4**), sanitized structured UI state, planner server, actions, verify loop, metrics.

## Current blocker

None.

## Next exact task

Phase 3 — local redaction + outbound privacy guard (details in PROGRESS.md → NEXT EXACT TASK).
Awaiting review.

## Things another AI/developer must NOT break

- **Core principle:** raw sensitive values must never leave the browser.
- **Detection classifies SIGNALS, never values** (`detect.js`). The observer must not start
  returning field values; keep detection output = `{ id, role, sensitive, label }`.
- The screenshot stays local (in-memory, dropped) — do not store or transmit it.
- Keep permissions minimal (`activeTab` + `scripting`); no `host_permissions`/`tabs` without cause.
- `observePage()` must stay **self-contained** (serialized for injection; no imports/closures).
- Never `eval`/execute server output (Phase 6+). Never commit secrets/`.env`. Never force-push.
  Demo/test data stays FAKE.
