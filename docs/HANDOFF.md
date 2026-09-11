# Session Handoff

## Current Task

Make NVIDIA planner timeout configurable; then verify live AI smoke and Chrome PLAN.
Started clean on main at 076a81f. OCR, fusion, candidates, privacy and grounding are
live-verified and were not changed. No Execute or autonomous loop.

## Confirmed Live Evidence (User)

After 076a81f, Chrome sends a current Continue actionCandidate; privacy remains
5 sensitive / 5 redacted / rawPiiIncluded=false. AI POST /plan returns 504 with
X-EdgeSight-Planner: ai and the generic unavailable body. AI smoke is UNAVAILABLE.
Repository confirmed a 15s timeout in the HTTP provider and outer AI planner;
asyncio/httpx timeouts map to PlannerFailure(504). Provider latency cause is not yet known.

## Completed Change

- NVIDIA_TIMEOUT_SECONDS is a non-secret startup setting: default 30, finite 1-120.
  Zero, negative, non-numeric, NaN, infinity and out-of-range values fail startup with
  a fixed message that does not echo the input. Restart required after configuration.
- The existing HTTP and overall deadlines use this setting. Timeout remains 504;
  internal PlannerFailure.timed_out=true distinguishes it without logging data.
- Browser/smoke deadline increased from 20s to 35s so the default provider deadline
  can complete. Server overrides do not change the independent 35s client budget.
- No retries, deterministic fallback, model/prompt changes, or response-contract changes.
- Updated configuration example, timeout docs, and regression tests.

## Tests

- Configuration: 3/3; AI planner/provider/endpoint: 32/32; transport: 51/51 PASS.
- Full server suite: 61/61 PASS.
- Full extension suite: 248/248 PASS, zero skipped.
- npm run build, npm run check, Python compileall: PASS; packaged OCR assets unchanged.
- Diff review/whitespace check: PASS. Credential-pattern scan of 101 tracked or new
  text files (excluding archive/vendor): no findings; no private .env files unignored.

## Files Changed

- server/app/{config,nvidia_provider,ai_planner}.py
- server/tests/test_config.py and server/tests/test_ai_planner.py
- server/.env.example and server/README.md
- extension/src/transport/config.js and extension/tests/transport.test.mjs
- README.md, docs/AI_CONTEXT.md, docs/HANDOFF.md

## Live Test Ownership / Exact Resume Point

The agent shell has no NVIDIA_API_KEY and no local .env files. The user chose to run
the smoke in their already configured terminal and share the safe result. No key was
requested in chat, no provider request was run by this agent, and no Chrome run is claimed.

1. In that configured terminal, preserve the local key and extension origin, stop the
   old FastAPI process, set PLANNER_MODE=ai and NVIDIA_TIMEOUT_SECONDS=30, then restart
   from server/: .venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
2. From repository root: node scripts/smoke-planner.mjs --ai.
3. If it times out at 30s, STOP increasing the timeout. Investigate latency,
   connectivity, model availability, request/prompt size and provider health next.
4. Only after smoke passes: reload EdgeSight and Employee Travel Request; ANALYZE / PLAN.
   Expect current candidate, POST /plan 200, header ai, CLICK on that candidate, privacy
   still 5/5/false. DO NOT EXECUTE. Record live result, then stop this task.

## Git / Constraints

Commit message: fix: make NVIDIA planner timeout configurable.
Resolve containing commit with git log -1 --format=%H; normal push only; verify
HEAD == origin/main and clean tree. No reset/restore/cleanup of working files.
Do not change OCR, fusion, candidates, privacy, grounding, model or action architecture.
No retries, fallback, blind timeout increase, new actions, automatic Execute or loop.
