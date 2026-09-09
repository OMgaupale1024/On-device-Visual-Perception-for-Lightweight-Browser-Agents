# EdgeSight — HANDOFF (emergency recovery)

> If a session (Claude / Codex / developer) ends suddenly, read this file first, then
> `PROGRESS.md`. Update this file at the end of EVERY phase.

## Current working state

Phase 1 complete and **pushed**. EdgeSight is a loadable Chrome **MV3 extension**: on
**ANALYZE PAGE** it observes the active tab's DOM (counts visible inputs/buttons/labels, title,
viewport) **and** captures the visible-tab pixels locally, showing real counts + capture
resolution in the popup. A controlled demo page exists. **No PII detection/redaction, no server,
no AI yet** — those are Phase 2+.

## Current branch

`main`, tracking `origin/main`. History: Initial commit → Phase 0 foundation → Phase 0 docs →
Phase 1. Repo:
https://github.com/OMgaupale1024/On-device-Visual-Perception-for-Lightweight-Browser-Agents

## Latest useful commit

The Phase 1 commit on `main` (pushed). Verify with `git log --oneline -3`.

## How to run — extension

1. Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right).
3. **Load unpacked** → select the `extension/` folder.
4. Click the EdgeSight toolbar icon to open the popup.

## How to run — demo page

Open `demo-page/index.html` in Chrome (double-click, or File → Open File).
If ANALYZE PAGE errors on the `file://` page, enable **"Allow access to file URLs"** for EdgeSight
(chrome://extensions → EdgeSight → Details). Alternative: `python -m http.server` inside
`demo-page/` and open the `http://localhost:PORT` URL.

## How ANALYZE PAGE works

Popup sends `{type: ANALYZE_PAGE}` to the background service worker, which:
1. `chrome.tabs.query({active:true, currentWindow:true})` → active tab.
2. `chrome.scripting.executeScript({target:{tabId}, func: observePage})` → DOM counts, title, viewport.
3. `chrome.tabs.captureVisibleTab(windowId, {format:'png'})` → data URL → `createImageBitmap` reads
   real width/height → image dropped (in-memory only, never stored/sent).
4. Returns `{ok, observation, capture}`; the popup renders counts + capture status/resolution.

## Message flow / files added in Phase 1

```
extension/
  manifest.json                     MV3; permissions: activeTab + scripting
  src/shared/messages.js            MSG.ANALYZE_PAGE constant
  src/content/observe.js            observePage() — self-contained, injected into the page
  src/background/service-worker.js  module service worker; orchestrates observe + capture
  src/popup/popup.html              popup markup
  src/popup/popup.css               popup styles
  src/popup/popup.js                popup logic (module; click → message → render)
demo-page/
  index.html  style.css  script.js  Employee Travel Request (FAKE data) + success state
```

## Environment requirements

Chrome (MV3). Node 24 / Python 3.10 are only for tooling/tests — **not** required to run the extension.

## Known browser restrictions

- `activeTab` is granted only after the user invokes the extension (opens the popup); ANALYZE is
  user-initiated, so this is satisfied.
- Restricted pages (`chrome://`, Chrome Web Store, other extensions) can't be observed/captured →
  popup shows a graceful error.
- `file://` pages require "Allow access to file URLs" enabled for the extension.
- `captureVisibleTab` returns **device-pixel** dimensions (HiDPI → larger than CSS viewport).

## Known bugs

- None in the extension code. The dev automation harness times out on screenshots (harness issue,
  unrelated to EdgeSight); manual capture in Chrome is the verification path (see TESTING M4).

## Incomplete work

Everything Phase 2+ (see PROGRESS.md → REMAINING): PII detection, redaction, privacy guard,
sanitized state, planner server, actions, verification loop, metrics, vision model.

## Current blocker

None.

## Next exact task

Phase 2 — on-device sensitive-field detection (details in PROGRESS.md → NEXT EXACT TASK). Awaiting review.

## Things another AI/developer must NOT break

- **Core principle:** raw sensitive values must never leave the browser. The screenshot stays local
  (in-memory, dropped) — do not store or transmit it.
- Keep permissions minimal (`activeTab` + `scripting`). Do not add `host_permissions` or `tabs`
  without a documented reason.
- `observePage()` must stay **self-contained** (it is serialized for injection; no imports/closures).
- Never `eval`/execute server output (Phase 5+). Never commit secrets/`.env`. Never force-push.
- Demo/test data stays FAKE.
