import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runAgent, AGENT_STATE } from '../src/background/agent-controller.js';
import { GOAL_ACHIEVED_REASON, STOP_CODE } from '../src/shared/outcome-contract.js';

globalThis.crypto ??= { randomUUID };

// One READY observe/plan result. CLICK unless action overridden.
// `reason` is the planner's server-supplied reason. A STOP defaults to the
// achieved-goal reason so the existing success cases stay explicit about WHY
// they complete; non-success STOP tests pass a real non-success reason instead.
function ok({ action = 'CLICK', target = 'visual_1', signature = 'sig', observationId = 'obs_1',
  reason = action === 'STOP' ? GOAL_ACHIEVED_REASON : 'A suitable visual target is visible.' } = {}) {
  const plan = { action, target: action === 'CLICK' ? target : null, observationId, reason };
  return { observeStatus: 'READY', observationId, planner: { status: 'READY', plan },
    ticket: action === 'CLICK' ? { observationId, target } : null,
    targetText: action === 'CLICK' ? 'Continue' : null, signature, measurements: {} };
}

// Phase 13C: a passing local verifier once an action was executed (mirrors the real
// verifier's NO_ACTION_TAKEN when nothing ran). Verification-failure paths live in
// agent-verification.test.mjs.
const passingVerifier = async (_op, lastAction) => lastAction ? { status: 'VERIFIED' }
  : { status: 'NOT_VERIFIED', reason: 'NO_ACTION_TAKEN' };

// Drive runAgent with a scripted observePlan queue and an execute stub.
function drive(steps, { execute = async () => ({ status: 'EXECUTED' }), cancelled = () => false, opts = {} } = {}) {
  const events = [];
  let i = 0;
  const observePlan = async () => {
    const s = steps[Math.min(i, steps.length - 1)];
    i++;
    if (typeof s === 'function') return s();
    if (s instanceof Error) throw s;
    return s;
  };
  return runAgent('goal', { observePlan, execute, verifyResult: passingVerifier, settle: async () => {}, cancelled,
    emit: (e) => events.push(e), ...opts }).then((r) => ({ ...r, events }));
}

test('1: CLICK executes, re-observes, then an achieved-goal STOP completes the run', async () => {
  const r = await drive([ok(), ok({ action: 'STOP', observationId: 'obs_2' })]);
  assert.equal(r.state, AGENT_STATE.COMPLETED);
  assert.equal(r.reason, STOP_CODE.GOAL_ACHIEVED);
  const names = r.events.map((e) => e.event);
  assert.deepEqual(names, ['AGENT_RUN_STARTED', 'AGENT_STEP_STARTED', 'OBSERVATION_READY', 'PRIVACY_PASS',
    'PLAN_READY', 'ACTION_VALIDATED', 'ACTION_EXECUTED', 'AGENT_STEP_STARTED', 'REOBSERVATION_READY',
    'PRIVACY_PASS', 'PLAN_READY', 'VERIFICATION_STARTED', 'VERIFICATION_RESULT', 'AGENT_COMPLETED']);
});

test('2: STOP on the first step executes no action', async () => {
  let executed = 0;
  const r = await drive([ok({ action: 'STOP' })], { execute: async () => { executed++; return { status: 'EXECUTED' }; } });
  // Phase 13C: an achieved-goal claim with no executed action has nothing to verify.
  assert.equal(r.state, AGENT_STATE.STOPPED);
  assert.equal(r.reason, 'VERIFICATION_INCONCLUSIVE');
  assert.equal(executed, 0);
});

// ---------------------------------------------------------------------------
// Phase 13A — terminal-state truthfulness.
//
// Regression guard for the false-completion bug: the controller used to return
// COMPLETED for EVERY STOP, so "no target available" and "unsafe to continue"
// were both reported to the user as TASK COMPLETE. Only the achieved-goal
// reason may complete; everything else is a non-success terminal state.
// ---------------------------------------------------------------------------

test('13A-1: STOP with the achieved-goal reason is the ONLY success', async () => {
  // Preceded by an action so Phase 13C verification has something to check.
  const r = await drive([ok(), ok({ action: 'STOP', observationId: 'obs_2', reason: GOAL_ACHIEVED_REASON })]);
  assert.equal(r.state, AGENT_STATE.COMPLETED);
  assert.equal(r.reason, STOP_CODE.GOAL_ACHIEVED);
});

// Every non-success reason the two planner modes can actually emit.
const NON_SUCCESS_STOP_REASONS = [
  // AI mode — server/app/ai_contract.py SafeReason
  ['No suitable visual target is available.', STOP_CODE.NO_TARGET],
  ['The request cannot be completed safely.', STOP_CODE.UNSAFE],
  ['Required fields are filled and Continue is visible.', STOP_CODE.NO_PROGRESS],
  ['A suitable visual target is visible.', STOP_CODE.NO_PROGRESS],
  // AI reasonCode messages (server REASON_MESSAGES) added with the reasonCode contract
  ['Required information is missing or unavailable.', STOP_CODE.INCOMPLETE_CONTEXT],
  ['The next action advances the goal.', STOP_CODE.NO_PROGRESS],
  // deterministic mode — server/app/planner.py
  ['Goal is not supported by the deterministic travel planner.', STOP_CODE.UNSUPPORTED_GOAL],
  ['Required travel fields are missing, ambiguous or incomplete.', STOP_CODE.INCOMPLETE_CONTEXT],
  ['A unique Continue visual element is unavailable.', STOP_CODE.NO_TARGET],
];

for (const [reason, code] of NON_SUCCESS_STOP_REASONS) {
  test(`13A-2: STOP "${reason}" is NOT completed`, async () => {
    const r = await drive([ok({ action: 'STOP', reason })]);
    assert.notEqual(r.state, AGENT_STATE.COMPLETED);
    assert.equal(r.state, AGENT_STATE.STOPPED);
    assert.equal(r.reason, code);
    // The terminal event must not be the completion event either.
    assert.equal(r.events.at(-1).event, 'AGENT_STOPPED');
  });
}

// Fail closed: an unknown/absent/malformed reason must never complete.
// The reason is assigned onto the plan directly rather than passed through ok(),
// because a destructuring default would replace `undefined` with the success
// reason and the test would silently stop exercising the missing-reason path.
for (const reason of [undefined, null, '', 'Some brand new server reason.', 'constructor', 42]) {
  test(`13A-3: unrecognised STOP reason ${JSON.stringify(reason)} fails closed to STOPPED`, async () => {
    const fixture = ok({ action: 'STOP' });
    fixture.planner.plan.reason = reason;
    const r = await drive([fixture]);
    assert.notEqual(r.state, AGENT_STATE.COMPLETED);
    assert.equal(r.state, AGENT_STATE.STOPPED);
    assert.equal(r.reason, STOP_CODE.UNCLASSIFIED);
  });
}

test('13A-4: CLICK -> re-observe -> achieved-goal STOP completes (live success shape)', async () => {
  const r = await drive([ok(), ok({ action: 'STOP', observationId: 'obs_2', reason: GOAL_ACHIEVED_REASON })]);
  assert.equal(r.state, AGENT_STATE.COMPLETED);
  assert.equal(r.reason, STOP_CODE.GOAL_ACHIEVED);
  assert.equal(r.step, 2);
  assert.deepEqual(r.timings.map((t) => t.action), ['CLICK', 'STOP']);
});

test('13A-5: CLICK -> re-observe -> no-target STOP does NOT complete', async () => {
  const r = await drive([ok(), ok({ action: 'STOP', observationId: 'obs_2',
    reason: 'No suitable visual target is available.' })]);
  assert.equal(r.state, AGENT_STATE.STOPPED);
  assert.equal(r.reason, STOP_CODE.NO_TARGET);
  // The click still happened; only the success claim is withheld.
  assert.deepEqual(r.timings.map((t) => t.action), ['CLICK', 'STOP']);
});

test('3: invalid target (no ticket) fails safely without executing', async () => {
  let executed = 0;
  const bad = { ...ok(), ticket: null };
  const r = await drive([bad], { execute: async () => { executed++; return { status: 'EXECUTED' }; } });
  assert.equal(r.state, AGENT_STATE.FAILED);
  assert.equal(r.reason, 'INVALID_TARGET');
  assert.equal(executed, 0);
});

test('4: stale observation rejected at execution fails the run', async () => {
  const r = await drive([ok()], { execute: async () => ({ status: 'BLOCKED', reason: 'STALE_OBSERVATION' }) });
  assert.equal(r.state, AGENT_STATE.FAILED);
  assert.equal(r.reason, 'STALE_OBSERVATION');
});

test('5: planner unavailable stops the run (no fallback)', async () => {
  const r = await drive([{ observeStatus: 'READY', observationId: 'obs_1', planner: { status: 'UNAVAILABLE' } }]);
  assert.equal(r.state, AGENT_STATE.FAILED);
  assert.equal(r.reason, 'PLANNER_UNAVAILABLE');
});

test('6: privacy failure stops before any planner request or action', async () => {
  let executed = 0;
  const r = await drive([{ observeStatus: 'FAILED', observeReason: 'PRIVACY_FAILED' }],
    { execute: async () => { executed++; return { status: 'EXECUTED' }; } });
  assert.equal(r.state, AGENT_STATE.FAILED);
  assert.equal(r.reason, 'PRIVACY_FAILED');
  assert.equal(executed, 0);
  assert.ok(!r.events.some((e) => e.event === 'PLAN_READY'));
});

test('7: perception failure (thrown) stops the run', async () => {
  const r = await drive([new Error('PERCEPTION_FAILED')]);
  assert.equal(r.state, AGENT_STATE.FAILED);
  assert.equal(r.reason, 'PERCEPTION_FAILED');
});

test('8: MAX_STEPS reached stops the run', async () => {
  // Every step CLICKs a fresh observation (new signature) so the loop never STOPs.
  let n = 0;
  const r = await drive([() => ok({ signature: 'sig_' + (n++), observationId: 'obs_' + n })], { opts: { maxSteps: 3 } });
  assert.equal(r.state, AGENT_STATE.STOPPED);
  assert.equal(r.reason, 'MAX_STEPS');
  assert.equal(r.step, 3);
});

test('9: cancellation after observe prevents the pending plan from executing', async () => {
  let executed = 0, cancel = false;
  const r = await runAgent('goal', {
    observePlan: async () => { cancel = true; return ok(); },
    execute: async () => { executed++; return { status: 'EXECUTED' }; },
    settle: async () => {}, cancelled: () => cancel, emit: () => {},
  });
  assert.equal(r.state, AGENT_STATE.CANCELLED);
  assert.equal(executed, 0);
});

test('10: repeated identical action on unchanged observation stops safely', async () => {
  // Same signature+target every step; guard fails on the 3rd attempt (limit 2).
  let clicks = 0;
  const r = await drive([ok()], { execute: async () => { clicks++; return { status: 'EXECUTED' }; }, opts: { maxSteps: 10 } });
  assert.equal(r.state, AGENT_STATE.FAILED);
  assert.equal(r.reason, 'LOOP_DETECTED');
  assert.equal(clicks, 2); // two identical clicks allowed, third blocked before executing
});
