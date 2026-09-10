# EdgeSight — Handoff

**Phase 6A complete in code. Stop for review.** No real model or browser execution.

## Takeover protocol

Only one AI writes at a time. Before changes: git status, git branch,
git log --oneline -10, git fetch, git pull --ff-only. Read README, AI_CONTEXT,
HANDOFF, ARCHITECTURE, PROGRESS, DECISIONS and TESTING; inspect code/tests/history.
Never force push. Before phase completion: tests, docs, AI_CONTEXT, diff/artifact
inspection, commit, normal push, HEAD == origin/main and clean-tree verification.

## Delivered boundary

The Phase 5 builder still receives safe semantics, safe OCR, image metadata and
locally known sensitive strings for its final guard. It now privately approves the
frozen context's exact serialization; safe bytes only are retained in a WeakMap.
Transport accepts only that context identity, verifies the approval, and posts it
as JSON to localhost. It has no raw-value list, raw OCR/image or local-response API.
The service worker clears known-value references before passing agent.context.

Server: app/main.py (FastAPI, exact-origin CORS, generic errors, health/plan),
app/schemas.py (strict wire contract, defensive PII checks), app/planner.py
(deterministic travel rules). requestPlan validates response keys/action/version,
same observation and existing visual ID. Five-second deadline covers response body.
Server errors preserve Phases 1–5. Popup shows suggestions only.

Structured context only; sanitized image upload is deferred to Phase 6B. The
Phase 3 private handle is unchanged and must remain the sole future image source.
No real LLM/VLM, selectors/code/coordinates from server, action execution or re-observation.

## Run and tests

Exact Windows instructions: [server/README.md](../server/README.md).
From server/, after installing requirements and setting the actual extension origin:

```powershell
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Reload extension/, allow file URLs, open demo-page/index.html, keep seven fields and
Continue visible, and click Analyze / Plan. Inspect service worker DevTools Network.

Current evidence: **115/115 Node test entries**, **24/24 server test methods**,
all 20 transport contamination cases → BLOCKED / fetch count 0, checks pass.
Actual Node requestPlan → local Uvicorn /health and /plan CLICK/STOP smoke passed
with a 1553-byte approved synthetic context. This is not Chrome proof.
Detailed manual workflow and historical evidence remain in TESTING.

## Manual evidence

User confirmed the current Chrome flow works before Phase 6A. Historical Phase 1
M1–M4 and the reported Phase 3 privacy-display test remain recorded. No individual
unreported mask, OCR recognition, timing, offline, Network or HiDPI check is inferred.

Phase 6A Chrome/server demo, exact payload inspection, actual Continue ID and no-click
confirmation are **PENDING user review**. Server-offline UI should also be reviewed.

## Git and next task

Baseline synchronized: ae4e37e. Phase 6A commit subject:
`feat: add privacy-safe planner transport`. The commit containing this handoff is the
Phase 6A checkpoint; resolve its exact hash with `git log -1 --format=%H`. The final
delivery report records commit/push and clean-tree verification (self-hashes cannot
be embedded in their own commit). No API key, .env, raw capture, PII dump, venv,
__pycache__ or node_modules belongs in the commit.

Exact next task after review: **Phase 6B — ONE real server-side LLM/VLM planner**
under the same privacy-safe request and strict response schema. Do not start it in
the Phase 6A session. Phase 7 execution and Phase 8 re-observation are separate.
