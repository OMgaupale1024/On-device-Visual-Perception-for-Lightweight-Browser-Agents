# EdgeSight — HANDOFF (emergency recovery)

> If a session (Claude / Codex / developer) ends suddenly, read this file first, then
> `PROGRESS.md`. It tells you exactly where things are and the next concrete step.
> Update this file at the end of EVERY phase.

## Current working state

Phase 0 (foundation) complete and **pushed to GitHub**
(`origin` = https://github.com/OMgaupale1024/On-device-Visual-Perception-for-Lightweight-Browser-Agents).
Repository has docs, README, `.gitignore`, `.gitattributes`, `.env.example`, and top-level
stub folders. **No application code yet** — no extension, no server, no demo behavior.
Nothing is runnable beyond reading the repo.

## Current branch

`main`, tracking `origin/main`. Two commits: GitHub's `Initial commit`, then the Phase 0
foundation on top of it.

## Latest useful commit

`7a443d3` — "feat: initialize EdgeSight prototype architecture" (pushed to `origin/main`).
Verify with `git log --oneline -2`.

## How to run — extension

Not built yet (Phase 1). Intended: `chrome://extensions` → enable Developer mode →
"Load unpacked" → select `extension/`.

## How to run — server

Not built yet (Phase 5). Intended: `cd server && pip install -r requirements.txt &&
uvicorn app.main:app --reload` (reads `server/.env`, copied from `.env.example`).

## How to run — demo page

Not built yet (Phase 1). Intended: open `demo-page/index.html` directly in Chrome.

## Environment requirements

- Chrome (Manifest V3).
- Node v24.x — verified v24.11.0 (only needed if extension build tooling is added).
- Python 3.10+ — verified 3.10.11 (for the planner server).
- git 2.51; gh 2.97 present but **not authenticated**.

## Important files

- `README.md` — overview + run table + roadmap.
- `docs/ARCHITECTURE.md` — components, data/privacy/action flow, interface shapes, full tree.
- `docs/PROGRESS.md` — live status + exact next task.
- `docs/DECISIONS.md` — why each choice was made.
- `docs/TESTING.md` — test log.
- `.env.example` — server env template (no secrets).

## Known bugs

None (no runtime code yet).

## Incomplete work

Everything from Phase 1 onward. See PROGRESS.md → REMAINING.

## Current blocker

None. Phase 0 is pushed. Note: `gh` CLI is not authenticated, but `git push` works via the
cached Windows credential helper. If a future push prompts for credentials, run
`gh auth login` (or configure Git Credential Manager) and retry — do not force-push.

## Next exact task

Begin **Phase 1** (awaiting user review of Phase 0 first).
- `extension/manifest.json` (MV3): popup, background service worker, content script,
  `activeTab`/`scripting` permissions.
- Popup: title "EDGESIGHT", goal input, **ANALYZE PAGE** button, status line.
- Content script: on ANALYZE PAGE, count `inputs`, `buttons`, and visible labels; return to popup.
- `demo-page/index.html`: Employee Travel Request form, **FAKE data only**
  (Rahul Sharma / rahul@example.com / 9876543210 / EMP1024 / Bengaluru / Conference /
  password) + a **Continue** button.
- No AI, no Raspberry Pi. Then test, update docs, commit, push, STOP + report.

## Things another AI/developer must NOT break

- The core principle: **raw sensitive values must never leave the browser.** Any outbound
  path must go through the (future) privacy guard.
- Never commit `.env` or real API keys; never put keys in `extension/` or `demo-page/`.
- Never `eval` or execute planner-supplied JavaScript; validate actions against the schema.
- Never force-push or rewrite shared history. Commit phase by phase.
- Demo/test data stays FAKE.
