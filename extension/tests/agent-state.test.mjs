// Phase 13B — a reopened popup must reflect the REAL background run. The worker's
// run snapshot is the source of truth; the popup only renders it and cancels it.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MSG } from '../src/shared/messages.js';
import { initialAgentSnapshot, reduceAgentSnapshot, AGENT_MAX_STEPS } from '../src/background/agent-controller.js';

const SNAPSHOT_KEYS = ['active', 'lastAction', 'maxSteps', 'outcomeCode', 'runId', 'state', 'step'];

// --- pure reducer --------------------------------------------------------------

test('snapshot: tracks step and safe action; drops target text and unknown actions', () => {
  let s = reduceAgentSnapshot(initialAgentSnapshot(), { event: 'AGENT_RUN_STARTED', runId: 'run_a', maxSteps: 8 });
  s = reduceAgentSnapshot(s, { event: 'AGENT_STEP_STARTED', runId: 'run_a', step: 2 });
  s = reduceAgentSnapshot(s, { event: 'PLAN_READY', runId: 'run_a', step: 2, action: 'TYPE', target: 'secret@example.invalid' });
  assert.deepEqual(s, { active: true, runId: 'run_a', state: 'RUNNING', step: 2, maxSteps: 8, lastAction: 'TYPE', outcomeCode: null });
  assert.equal(reduceAgentSnapshot(s, { event: 'PLAN_READY', runId: 'run_a', action: 'free model text' }).lastAction, null);
  assert.equal(reduceAgentSnapshot(s, { event: 'PLAN_READY', runId: 'run_a', action: 'constructor' }).lastAction, null);
});

test('snapshot: events from another run never mutate the current one', () => {
  const s = reduceAgentSnapshot(initialAgentSnapshot(), { event: 'AGENT_RUN_STARTED', runId: 'run_a', maxSteps: 8 });
  assert.equal(reduceAgentSnapshot(s, { event: 'AGENT_STEP_STARTED', runId: 'run_old', step: 5 }), s);
  assert.equal(reduceAgentSnapshot(s, { event: 'AGENT_STOPPED', runId: 'run_old', state: 'CANCELLED', reason: 'CANCELLED' }), s);
});

test('snapshot: terminal keeps Phase 13A state/code; exception-like reasons are dropped', () => {
  const s = reduceAgentSnapshot(initialAgentSnapshot(), { event: 'AGENT_RUN_STARTED', runId: 'run_a', maxSteps: 8 });
  const done = reduceAgentSnapshot(s, { event: 'AGENT_STOPPED', runId: 'run_a', state: 'STOPPED', reason: 'STOP_NO_TARGET', step: 3 });
  assert.deepEqual([done.active, done.state, done.outcomeCode, done.step], [false, 'STOPPED', 'STOP_NO_TARGET', 3]);
  // After termination, late events are ignored.
  assert.equal(reduceAgentSnapshot(done, { event: 'AGENT_STEP_STARTED', runId: 'run_a', step: 4 }), done);
  const odd = reduceAgentSnapshot(s, { event: 'AGENT_FAILED', runId: 'run_a', state: 'FAILED', reason: 'TypeError: at secret@x' });
  assert.equal(odd.outcomeCode, null);
});

// --- real service worker ------------------------------------------------------

const known = 'synthetic-sensitive@example.invalid';
const raw = 'data:image/png;base64,AA==';

async function worker() {
  let listener, clicks = 0, plannerCalls = 0, gate = null;
  const planner = { script: [] }; // queued plan actions, in order
  globalThis.fetch = async (_url, options) => {
    plannerCalls++;
    const context = JSON.parse(options.body);
    if (gate) await gate.promise;
    const click = planner.script.shift() === 'CLICK';
    return { ok: true, headers: { get: () => 'ai' }, json: async () => ({
      schemaVersion: 1, observationId: context.observation.id,
      action: click ? 'CLICK' : 'STOP', target: click ? context.actionCandidates[0] : null,
      reason: click ? 'A suitable visual target is visible.' : 'The goal is already achieved.' }) };
  };
  globalThis.chrome = {
    runtime: {
      id: 'test', getURL: (p) => 'chrome-extension://test/' + p,
      onMessage: { addListener(fn) { listener = fn; } },
      getContexts: async () => [{}],
      sendMessage: async ({ target }) => {
        if (target !== 'ocr-host') return;
        return { ok: true, result: { data: { text: known, blocks: [{ paragraphs: [{ lines: [
          { text: known, confidence: 90, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 } },
          { text: 'Continue', confidence: 95, bbox: { x0: 5, y0: 60, x1: 60, y1: 80 } },
        ] }] }] }, width: 200, height: 100,
        timing: { cold: false, initializationMs: 1, inferenceMs: 1, totalMs: 2 } } };
      },
    },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
    tabs: {
      async query() { return [{ id: 1, windowId: 1, url: 'https://demo.invalid/form' }]; },
      async get() { return { id: 1, windowId: 1, url: 'https://demo.invalid/form' }; },
      async captureVisibleTab() { return raw; },
    },
    scripting: {
      async executeScript({ func }) {
        if (func.name === 'clickInPage') { clicks++; return [{ result: { status: 'EXECUTED' } }]; }
        if (func.name === 'observePage') {
          return [{ documentId: 'document-1', result: {
            counts: { inputs: 1, buttons: 1, labels: 1 }, viewport: { width: 200, height: 100 },
            devicePixelRatio: 1, visualViewport: { scale: 1, x: 0, y: 0 },
            buttonRects: [{ rect: { x: 5, y: 60, width: 55, height: 20 } }],
            fieldSignals: [{ id: 'field_1', type: 'email', label: known, rect: { x: 10, y: 10, width: 50, height: 20 } }],
          } }];
        }
        return [{ result: [{ id: 'field_1', value: known }] }];
      },
    },
  };
  globalThis.createImageBitmap = async () => ({ width: 200, height: 100, close() {} });
  globalThis.OffscreenCanvas = class {
    getContext() { return { drawImage() {}, fillRect() {} }; }
    async convertToBlob() { return new Blob(['x']); }
  };
  await import('../src/background/service-worker.js');
  const sender = { id: 'test', url: 'chrome-extension://test/src/popup/popup.html' };
  const send = (message) => new Promise((resolve) => listener(message, sender, resolve));
  return {
    send, planner, clicks: () => clicks, plannerCalls: () => plannerCalls,
    hold() { let release; gate = { promise: new Promise((r) => { release = r; }) }; return () => { gate = null; release(); }; },
  };
}

const tick = () => new Promise((r) => setImmediate(r));
async function until(fn) { for (let i = 0; i < 500 && !(await fn()); i++) await tick(); assert.ok(await fn(), 'condition reached'); }

test('worker: reopen sees the live run, cancel stops that SAME run, terminal state is retained', async () => {
  const w = await worker();
  const originalFetch = globalThis.fetch;

  // Fresh worker: idle, and a state query starts nothing.
  assert.deepEqual(await w.send({ type: MSG.GET_AGENT_STATE }), { active: false, state: 'IDLE' });
  assert.equal(w.plannerCalls(), 0);

  // A completed run stays readable after it ends (popup reopened afterwards).
  w.planner.script = ['CLICK', 'STOP'];
  const completed = await w.send({ type: MSG.RUN_TASK, goal: 'submit it' });
  assert.equal(completed.summary.state, 'COMPLETED');
  const doneState = await w.send({ type: MSG.GET_AGENT_STATE });
  assert.deepEqual(doneState, { active: false, runId: completed.summary.runId, state: 'COMPLETED', step: 2,
    maxSteps: AGENT_MAX_STEPS, lastAction: 'STOP', outcomeCode: 'GOAL_ACHIEVED' });
  await tick();

  // Start a run and hold it inside the planner call (popup "closes" here).
  const clicksBefore = w.clicks();
  w.planner.script = ['CLICK', 'CLICK'];
  const release = w.hold();
  const running = w.send({ type: MSG.RUN_TASK, goal: 'submit it' });
  await until(async () => w.plannerCalls() >= 3);

  // Popup reopens: the worker reports the active run and its current step.
  const live = await w.send({ type: MSG.GET_AGENT_STATE });
  assert.deepEqual(Object.keys(live).sort(), SNAPSHOT_KEYS);
  assert.equal(live.active, true);
  assert.equal(live.state, 'RUNNING');
  assert.equal(live.step, 1);
  assert.equal(live.maxSteps, AGENT_MAX_STEPS);
  assert.notEqual(live.runId, completed.summary.runId);
  const text = JSON.stringify(live);
  for (const secret of [known, 'Continue', 'submit it', 'visible', raw, 'demo.invalid']) assert.ok(!text.includes(secret), secret);

  // No duplicate run while one is active.
  assert.deepEqual(await w.send({ type: MSG.RUN_TASK, goal: 'submit it' }), { ok: false, error: 'A task is already running.' });

  // A cancel addressed to an older run is rejected and does not stop this one.
  assert.deepEqual(await w.send({ type: MSG.CANCEL_TASK, runId: completed.summary.runId }), { ok: false, reason: 'STALE_RUN' });
  assert.equal((await w.send({ type: MSG.GET_AGENT_STATE })).active, true);

  // STOP TASK from the reopened popup cancels the SAME run.
  assert.deepEqual(await w.send({ type: MSG.CANCEL_TASK, runId: live.runId }), { ok: true });
  release();
  const result = await running;
  assert.equal(result.summary.runId, live.runId);
  assert.equal(result.summary.state, 'CANCELLED');
  assert.equal(w.clicks(), clicksBefore); // the pending CLICK plan never acted

  const after = await w.send({ type: MSG.GET_AGENT_STATE });
  assert.deepEqual([after.active, after.runId, after.state, after.outcomeCode], [false, live.runId, 'CANCELLED', 'CANCELLED']);
  globalThis.fetch = originalFetch;
});

// --- popup rendering -------------------------------------------------------------

async function popup(agentState) {
  const html = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
  const make = (hidden) => ({
    textContent: '', disabled: false, listeners: {},
    classList: { _s: new Set(hidden ? ['hidden'] : []), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    append() {},
  });
  const elements = new Map([...html.matchAll(/id="([^"]+)"([^>]*)/g)].map((m) => [m[1], make(/class="[^"]*\bhidden\b/.test(m[2]))]));
  let listener;
  const calls = [];
  const chrome = { runtime: { id: 'extension-test', onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message) {
      calls.push(message);
      if (message.type === MSG.GET_VERIFICATION) return Promise.resolve({ status: 'WAITING' });
      if (message.type === MSG.GET_AGENT_STATE) return Promise.resolve(agentState);
      return Promise.resolve({ ok: true });
    } } };
  const source = (await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8'))
    .replace("import { MSG } from '../shared/messages.js';", '');
  vm.runInNewContext(source, { MSG, chrome, document: {
    getElementById: (id) => elements.get(id), createElement: () => make(false),
  }, window: { addEventListener() {} }, setTimeout, clearTimeout });
  await tick();
  const el = (id) => elements.get(id);
  return { el, calls, hidden: (id) => el(id).classList.contains('hidden'),
    update: (update) => listener({ type: MSG.AGENT_UPDATE, update }, { id: 'extension-test' }) };
}

const LIVE = { active: true, runId: 'run_live', state: 'RUNNING', step: 2, maxSteps: 8, lastAction: 'TYPE', outcomeCode: null };

test('popup open, idle: normal UI', async () => {
  const p = await popup({ active: false, state: 'IDLE' });
  assert.equal(p.el('agent-status').textContent, ''); // untouched: popup.html's own "Idle"
  assert.ok(p.hidden('agent-card'));
  assert.ok(p.hidden('stop-task'));
  assert.equal(p.el('run-task').disabled, false);
});

test('popup reopen during a run: RUNNING, step, last action, STOP TASK; never starts a run', async () => {
  const p = await popup(LIVE);
  assert.equal(p.el('agent-status').textContent, 'RUNNING');
  assert.equal(p.el('agent-step').textContent, '2 / 8');
  assert.equal(p.el('agent-decision').textContent, 'TYPE');
  assert.ok(!p.hidden('agent-card'));
  assert.ok(!p.hidden('stop-task'));
  assert.equal(p.el('run-task').disabled, true);
  assert.equal(p.el('analyze').disabled, true);
  assert.deepEqual(p.calls.map((c) => c.type), [MSG.GET_VERIFICATION, MSG.GET_AGENT_STATE]);

  // STOP TASK targets the run the worker reported.
  await p.el('stop-task').listeners.click();
  assert.equal(JSON.stringify(p.calls.at(-1)), JSON.stringify({ type: MSG.CANCEL_TASK, runId: 'run_live' }));

  // Updates from any other run are ignored; this run's terminal event releases the controls.
  p.update({ event: 'AGENT_COMPLETED', runId: 'run_old', state: 'COMPLETED', reason: 'GOAL_ACHIEVED' });
  assert.equal(p.el('agent-status').textContent, 'RUNNING');
  p.update({ event: 'AGENT_STEP_STARTED', runId: 'run_live', step: 3 });
  assert.equal(p.el('agent-step').textContent, '3 / 8');
  p.update({ event: 'AGENT_STOPPED', runId: 'run_live', state: 'CANCELLED', reason: 'CANCELLED', step: 3 });
  assert.equal(p.el('agent-status').textContent, 'TASK CANCELLED');
  assert.equal(p.el('status').textContent, 'Done');
  assert.ok(p.hidden('stop-task'));
  assert.equal(p.el('run-task').disabled, false);
  assert.equal(p.calls.filter((c) => c.type === MSG.RUN_TASK).length, 0);
});

const TERMINAL = [
  ['COMPLETED', 'GOAL_ACHIEVED', 'TASK COMPLETE'],
  ['STOPPED', 'STOP_NO_TARGET', 'TASK STOPPED'],
  ['FAILED', 'PLANNER_UNAVAILABLE', 'TASK FAILED'],
  ['CANCELLED', 'CANCELLED', 'TASK CANCELLED'],
];
for (const [state, outcomeCode, label] of TERMINAL) {
  test(`popup reopen after ${state}/${outcomeCode} restores "${label}"`, async () => {
    const p = await popup({ ...LIVE, active: false, state, outcomeCode, lastAction: 'STOP' });
    assert.equal(p.el('agent-status').textContent, label);
    assert.ok(!p.hidden('agent-card'));
    assert.ok(p.hidden('stop-task'));
    assert.equal(p.el('run-task').disabled, false);
    if (state !== 'COMPLETED') assert.doesNotMatch(p.el('agent-note').textContent, /complete/i);
  });
}
