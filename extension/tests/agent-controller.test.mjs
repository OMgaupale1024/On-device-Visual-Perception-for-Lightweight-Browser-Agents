import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runAgent, AGENT_STATE } from '../src/background/agent-controller.js';

globalThis.crypto ??= { randomUUID };

// One READY observe/plan result. CLICK unless action overridden.
function ok({ action = 'CLICK', target = 'visual_1', signature = 'sig', observationId = 'obs_1' } = {}) {
  const plan = { action, target: action === 'CLICK' ? target : null, observationId };
  return { observeStatus: 'READY', observationId, planner: { status: 'READY', plan },
    ticket: action === 'CLICK' ? { observationId, target } : null,
    targetText: action === 'CLICK' ? 'Continue' : null, signature, measurements: {} };
}

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
  return runAgent('goal', { observePlan, execute, settle: async () => {}, cancelled,
    emit: (e) => events.push(e), ...opts }).then((r) => ({ ...r, events }));
}

test('1: CLICK executes, re-observes, then STOP completes the run', async () => {
  const r = await drive([ok(), ok({ action: 'STOP', observationId: 'obs_2' })]);
  assert.equal(r.state, AGENT_STATE.COMPLETED);
  assert.equal(r.reason, 'PLANNER_STOP');
  const names = r.events.map((e) => e.event);
  assert.deepEqual(names, ['AGENT_RUN_STARTED', 'AGENT_STEP_STARTED', 'OBSERVATION_READY', 'PRIVACY_PASS',
    'PLAN_READY', 'ACTION_VALIDATED', 'ACTION_EXECUTED', 'AGENT_STEP_STARTED', 'REOBSERVATION_READY',
    'PRIVACY_PASS', 'PLAN_READY', 'AGENT_COMPLETED']);
});

test('2: STOP on the first step executes no action', async () => {
  let executed = 0;
  const r = await drive([ok({ action: 'STOP' })], { execute: async () => { executed++; return { status: 'EXECUTED' }; } });
  assert.equal(r.state, AGENT_STATE.COMPLETED);
  assert.equal(executed, 0);
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
