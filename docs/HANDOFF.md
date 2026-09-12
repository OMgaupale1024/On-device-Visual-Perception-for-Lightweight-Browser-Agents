# Session Handoff

## Current Task / Baseline

Phase 11B — make the existing CLICK/STOP pipeline autonomous: one user start drives
OBSERVE → PLAN → VALIDATE → ACT → SETTLE → RE-OBSERVE until STOP / limit / safe failure.
Action set intentionally stays CLICK + STOP only. Started clean at d9b3618 on main.

## What was built

- `extension/src/background/agent-controller.js` — pure, orchestration-only state machine
  (`runAgent(goal, deps)`). No planning intelligence: Nemotron (via injected `observePlan`)
  still decides every action. States: RUNNING/COMPLETED/STOPPED/FAILED/CANCELLED. Guards:
  `AGENT_MAX_STEPS=5`, cancel token (stops run + blocks a pending plan from acting),
  duplicate-action guard (`AGENT_DUPLICATE_LIMIT=2` on signature+action+target →
  LOOP_DETECTED), fail-closed on planner-unavailable / privacy / perception / action
  failure (no fallback, no retry). Emits safe count/id/status audit events.
- `service-worker.js` — extracted `observeAndPlan(goal)` (shared by manual Analyze and the
  loop); added `RUN_TASK`/`CANCEL_TASK` handlers and `observePlanForAgent` (maps privacy/
  perception failure → explicit stop reasons; computes an unchanged-page signature from the
  already-safe context). Manual `ANALYZE_PAGE`/`EXECUTE_ACTION` unchanged (now also guard
  against `agentActive`). Re-observation IS the next step's `observeAndPlan` — real fresh
  capture + planner call, never faked.
- `shared/messages.js` — `RUN_TASK`, `CANCEL_TASK`, `AGENT_UPDATE`.
- Popup — `RUN TASK (AUTONOMOUS)` + `STOP TASK` buttons and an agent status/step/log card;
  live `AGENT_UPDATE` rendering. Manual Analyze/Plan/Execute untouched.

## Tests / Limits

- Extension: **259/259 PASS** (248 prior + `agent-controller.test.mjs` 10 scenarios +
  `agent-integration.test.mjs` 1 wired end-to-end run). `npm run check`: PASS.
- Server: **65/65 PASS** (no server code changed).
- Controller unit tests cover: CLICK→execute→re-observe→STOP; first-step STOP (no action);
  invalid target; stale observation; planner unavailable; privacy failure (no plan/action);
  perception failure; MAX_STEPS; cancellation-before-execute; duplicate-action guard.
- Integration test drives the real service-worker `RUN_TASK` through the full local privacy
  pipeline (Chrome/Canvas/OCR/fetch doubles): CLICK step 1, fresh re-observe, STOP step 2,
  exactly one click, planner consulted per observation, no canary leak in any body.
- Manual-mode regression: existing `background.test.mjs` (Analyze/Execute) still green.
- These are automated doubles, not proof of live NVIDIA/Chrome behavior.

## Live Acceptance / Exact Resume Point (PENDING)

1. Start FastAPI in AI mode (real `NVIDIA_API_KEY`, server-side only), exact extension origin.
2. Reload EdgeSight; open the Employee Travel Request demo with all fields + Continue visible.
3. Goal: "Check whether this travel request is complete and submit it." Press **RUN TASK** ONCE.
   Do NOT press manual Plan/Execute.
4. Expect: step 1 observe → privacy SAFE → NVIDIA CLICK Continue → local click; step 2 fresh
   observe of submitted page → NVIDIA STOP → agent status TASK COMPLETE. Confirm
   rawPiiIncluded=false and planner NVIDIA AI throughout; no deterministic fallback.
5. Record the live result in docs/TESTING.md (Phase 11B section), then STOP.

## Uncommitted Files / Constraints

Committed as `feat: add autonomous observe-plan-act loop`. If resuming before commit, changed:
- extension/src/background/agent-controller.js (new)
- extension/src/background/service-worker.js
- extension/src/popup/popup.{html,js}
- extension/src/shared/messages.js
- extension/tests/agent-controller.test.mjs (new), extension/tests/agent-integration.test.mjs (new)
- docs/AI_CONTEXT.md, docs/HANDOFF.md, docs/TESTING.md

DO NOT: expand the action vocabulary (TYPE/NAVIGATE/SCROLL/PRESS_KEY/WAIT/voice), add a
deterministic fallback inside the loop, move any planning decision locally, or remove manual
mode. Privacy failure must stop immediately with no network request.
