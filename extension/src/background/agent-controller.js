// Phase 11B — autonomous OBSERVE → PLAN → VALIDATE → ACT → RE-OBSERVE loop.
//
// Orchestration ONLY. This module contains no planning intelligence: Nemotron
// (via the injected observePlan) still decides WHAT to do; the controller just
// coordinates the loop and enforces the safety guards. It is pure JS with all
// side effects injected, so the whole state machine is testable without Chrome.
//
// Each iteration's observePlan() is a fresh local observation + planner call,
// so step N+1's observation IS the re-observation of step N's action. A plan is
// always validated against its own observation (ticket carries the observationId),
// so a stale plan can never act on a newer page.

import { classifyStop, verifiedOutcome } from '../shared/outcome-contract.js';
import { ACTION_FIELDS } from '../shared/action-contract.js';

export const AGENT_MAX_STEPS = 8;
export const AGENT_SETTLE_MS = 750;
// Allow the same action+target on an unchanged observation this many times before
// declaring a loop. 2 identical attempts is fine; the 3rd fails closed.
export const AGENT_DUPLICATE_LIMIT = 2;

export const AGENT_STATE = Object.freeze({
  RUNNING: 'RUNNING', COMPLETED: 'COMPLETED', STOPPED: 'STOPPED',
  FAILED: 'FAILED', CANCELLED: 'CANCELLED',
});

// Phase 13B — the popup-safe run snapshot, derived ONLY from the events runAgent
// already emits, so it cannot drift from the controller. Whitelisted fields only:
// no target/page/OCR text, no plan reason, no URL, no exception body.
export function initialAgentSnapshot(maxSteps = AGENT_MAX_STEPS) {
  return { active: true, runId: null, state: AGENT_STATE.RUNNING, step: 0, maxSteps,
    lastAction: null, outcomeCode: null };
}

const TERMINAL_EVENTS = ['AGENT_COMPLETED', 'AGENT_STOPPED', 'AGENT_FAILED'];

export function reduceAgentSnapshot(snapshot, e) {
  if (!snapshot || !e) return snapshot;
  if (e.event === 'AGENT_RUN_STARTED') {
    return { ...initialAgentSnapshot(e.maxSteps ?? snapshot.maxSteps), runId: e.runId };
  }
  // Events of any other run (or after this one ended) never mutate the snapshot.
  if (!snapshot.active || e.runId !== snapshot.runId) return snapshot;
  if (e.event === 'AGENT_STEP_STARTED') return { ...snapshot, step: e.step };
  if (e.event === 'PLAN_READY') {
    return { ...snapshot, lastAction: Object.hasOwn(ACTION_FIELDS, e.action) ? e.action : null };
  }
  if (TERMINAL_EVENTS.includes(e.event)) {
    return { ...snapshot, active: false,
      state: Object.hasOwn(AGENT_STATE, e.state) ? e.state : AGENT_STATE.FAILED,
      step: e.step ?? snapshot.step,
      outcomeCode: typeof e.reason === 'string' && /^[A-Z_]{1,64}$/.test(e.reason) ? e.reason : null };
  }
  return snapshot;
}

export function newRunId() {
  return 'run_' + crypto.randomUUID();
}

// deps:
//   observePlan(goal) -> { observeStatus:'READY'|'FAILED', observeReason?, observationId?,
//                          planner:{status,plan}, ticket, targetText, signature, measurements }
//     (may throw; a throw is treated as OBSERVE_FAILED)
//   execute(ticket)   -> { status:'EXECUTED'|..., reason? }
//   settle(ms)        -> Promise (post-action page-settle delay before re-observe)
//   emit(event)       -> void (safe audit / UI updates; never PII)
//   cancelled()       -> boolean (true once the run is cancelled or superseded)
//   verifyResult(op, lastAction) -> { status:'VERIFIED'|'NOT_VERIFIED', reason? }
//     local result check of the CURRENT fresh observation (op) against the last
//     executed action ({ actionObservationId, dispatchedAt, beforeSignature } or null).
//     Missing or throwing => VERIFIER_UNAVAILABLE (fail closed, never COMPLETED).
export async function runAgent(goal, {
  observePlan, execute, verifyResult, settle = () => Promise.resolve(), emit = () => {}, cancelled = () => false,
  maxSteps = AGENT_MAX_STEPS, settleMs = AGENT_SETTLE_MS, duplicateLimit = AGENT_DUPLICATE_LIMIT,
} = {}) {
  const runId = newRunId();
  const startedAt = Date.now();
  const stepTimings = [];
  emit({ event: 'AGENT_RUN_STARTED', runId, maxSteps });

  const done = (state, reason, step) => {
    const finalEvent = state === AGENT_STATE.COMPLETED ? 'AGENT_COMPLETED'
      : state === AGENT_STATE.FAILED ? 'AGENT_FAILED' : 'AGENT_STOPPED';
    const summary = { runId, state, reason, step, steps: stepTimings.length,
      totalMs: Date.now() - startedAt, timings: stepTimings };
    emit({ event: finalEvent, ...summary });
    return summary;
  };

  let lastKey = null, repeats = 1, lastAction = null;
  for (let step = 1; step <= maxSteps; step++) {
    if (cancelled()) return done(AGENT_STATE.CANCELLED, 'CANCELLED', step);
    emit({ event: 'AGENT_STEP_STARTED', runId, step });
    const stepStart = Date.now();

    let op;
    try {
      op = await observePlan(goal);
    } catch (error) {
      const reason = ['PRIVACY_FAILED', 'PERCEPTION_FAILED'].includes(error?.message)
        ? error.message : 'OBSERVE_FAILED';
      return done(AGENT_STATE.FAILED, reason, step);
    }
    // A cancel during observe/plan must prevent this plan from ever acting.
    if (cancelled()) return done(AGENT_STATE.CANCELLED, 'CANCELLED', step);

    // Perception / privacy gate. A privacy failure fails closed here; observePlan
    // never calls the planner unless the context was READY, so no action was primed.
    if (op.observeStatus !== 'READY') {
      return done(AGENT_STATE.FAILED, op.observeReason || 'OBSERVE_FAILED', step);
    }
    emit({ event: step === 1 ? 'OBSERVATION_READY' : 'REOBSERVATION_READY',
      runId, step, observationId: op.observationId });
    emit({ event: 'PRIVACY_PASS', runId, step });

    // Planner must be live; fail closed (no fallback, no reuse, no retry loop).
    if (op.planner?.status !== 'READY') {
      return done(AGENT_STATE.FAILED, 'PLANNER_UNAVAILABLE', step);
    }
    const plan = op.planner.plan;
    emit({ event: 'PLAN_READY', runId, step, action: plan.action, target: op.targetText ?? null });

    // A STOP is terminal, but it is NOT automatically a success: the planner
    // stops both when the goal is achieved and when it cannot safely continue.
    // classifyStop owns that distinction (fail-closed: unknown => not success).
    // Phase 13C: even an achieved-goal STOP is only the planner's claim; COMPLETED
    // also needs the local verifier to find evidence in THIS fresh observation.
    if (plan.action === 'STOP') {
      stepTimings.push({ step, ms: Date.now() - stepStart, action: 'STOP' });
      const outcome = classifyStop(plan.reason);
      if (!outcome.success) return done(AGENT_STATE.STOPPED, outcome.code, step);
      emit({ event: 'VERIFICATION_STARTED', runId, step });
      const verifyStart = Date.now();
      let verification = null;
      try { verification = await verifyResult(op, lastAction); } catch { /* unavailable */ }
      const verdict = verifiedOutcome(verification);
      emit({ event: 'VERIFICATION_RESULT', runId, step, status: verdict.success ? 'VERIFIED' : 'NOT_VERIFIED',
        reason: verdict.code, detail: verdict.detail, ms: Date.now() - verifyStart });
      if (cancelled()) return done(AGENT_STATE.CANCELLED, 'CANCELLED', step);
      return done(verdict.success ? AGENT_STATE.COMPLETED : AGENT_STATE.STOPPED, verdict.code, step);
    }

    // Every action ticket already re-validated observation binding and parameters.
    if (!op.ticket) return done(AGENT_STATE.FAILED, 'INVALID_TARGET', step);

    // Repeated-action guard: same action+target on an effectively unchanged
    // observation (signature) more than the limit means we are stuck.
    const key = JSON.stringify([op.signature, plan.action, plan.target, plan.text, plan.key, plan.direction, plan.amount, plan.url]);
    repeats = key === lastKey ? repeats + 1 : 1;
    lastKey = key;
    if (repeats > duplicateLimit) return done(AGENT_STATE.FAILED, 'LOOP_DETECTED', step);

    emit({ event: 'ACTION_VALIDATED', runId, step, target: op.targetText });
    if (cancelled()) return done(AGENT_STATE.CANCELLED, 'CANCELLED', step);

    let exec;
    try {
      exec = await execute(op.ticket);
    } catch {
      return done(AGENT_STATE.FAILED, 'ACTION_FAILED', step);
    }
    if (cancelled()) return done(AGENT_STATE.CANCELLED, 'CANCELLED', step);
    if (exec?.status !== 'EXECUTED') {
      return done(AGENT_STATE.FAILED, exec?.reason || 'ACTION_FAILED', step);
    }
    // Reference for result verification: the pre-action observation and dispatch time.
    lastAction = { actionObservationId: op.observationId, dispatchedAt: Date.now(), beforeSignature: op.signature };
    emit({ event: 'ACTION_EXECUTED', runId, step, action: plan.action, target: op.targetText });
    stepTimings.push({ step, ms: Date.now() - stepStart, action: plan.action });

    // Let the page settle, then loop: the next observePlan re-observes fresh pixels.
    if (cancelled()) return done(AGENT_STATE.CANCELLED, 'CANCELLED', step);
    await settle(settleMs);
  }
  return done(AGENT_STATE.STOPPED, 'MAX_STEPS', maxSteps);
}
