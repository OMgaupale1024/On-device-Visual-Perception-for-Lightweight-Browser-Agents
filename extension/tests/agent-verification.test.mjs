// Phase 13C — a planner GOAL_ACHIEVED STOP is only a claim. TASK COMPLETE requires
// the local result verifier to find evidence in the CURRENT fresh observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MSG } from '../src/shared/messages.js';
import { runAgent, AGENT_STATE, initialAgentSnapshot, reduceAgentSnapshot } from '../src/background/agent-controller.js';
import { GOAL_ACHIEVED_REASON, STOP_CODE, VERIFY_CODE, verifiedOutcome } from '../src/shared/outcome-contract.js';
import { verifyStateChange, stateSignature } from '../src/verification/verify-visual-result.js';
import { buildSafeAgentContext } from '../src/privacy/agent-context.js';

globalThis.crypto ??= { randomUUID };

// --- verifier (generic, goal-agnostic) ---------------------------------------------

function approved(texts, { id = 'obs_new', capturedAt = 2000 } = {}) {
  return buildSafeAgentContext({ goal: '', semantic: { fields: [] },
    visualState: { items: texts.map((text, i) => ({ id: `visual_${i + 1}`, text,
      bbox: { x: 10, y: 10 + i * 30, width: 200, height: 20 }, confidence: 0.95 })) },
    image: { width: 1000, height: 500, redactedRegions: 0 },
    observation: { id, capturedAt: new Date(capturedAt).toISOString(), viewport: { width: 1000, height: 500 } },
    sensitiveValues: [] }).context;
}
const before = approved(['Form', 'Next'], { id: 'obs_old', capturedAt: 500 });
const last = { actionObservationId: 'obs_old', dispatchedAt: 1000, beforeSignature: stateSignature(before) };

test('verifier: fresh approved state that changed after the action is VERIFIED', () => {
  const r = verifyStateChange(approved(['Form', 'Saved']), last);
  assert.equal(r.status, 'VERIFIED');
  assert.deepEqual(r.evidence, { type: 'STATE_CHANGED', source: 'visual' });
  assert.ok(!JSON.stringify(r).includes('Saved')); // result carries no page text
});

test('verifier: unchanged fresh state is NOT verified', () => {
  assert.deepEqual(verifyStateChange(approved(['Form', 'Next']), last), { status: 'NOT_VERIFIED', reason: 'NO_STATE_CHANGE' });
});

test('verifier: the pre-action observation or a pre-dispatch capture cannot verify', () => {
  assert.equal(verifyStateChange(before, last).reason, 'STALE_OBSERVATION');
  assert.equal(verifyStateChange(approved(['Saved'], { id: 'obs_old' }), last).reason, 'STALE_OBSERVATION');
  assert.equal(verifyStateChange(approved(['Saved'], { capturedAt: 900 }), last).reason, 'STALE_OBSERVATION');
});

test('verifier: nothing executed => NO_ACTION_TAKEN; missing reference signature => INVALID_SPEC', () => {
  assert.equal(verifyStateChange(approved(['Saved']), null).reason, 'NO_ACTION_TAKEN');
  assert.equal(verifyStateChange(approved(['Saved']), { ...last, beforeSignature: undefined }).reason, 'INVALID_SPEC');
});

test('verifier: only the builder-approved context is accepted (no raw/cloned/planner data)', () => {
  const fresh = approved(['Saved']);
  for (const candidate of [structuredClone(fresh), { reason: GOAL_ACHIEVED_REASON }, { visualElements: [] }, null, undefined]) {
    assert.equal(verifyStateChange(candidate, last).reason, 'PRIVACY_FAILED');
  }
});

test('outcome contract: only VERIFIED is success; everything else fails closed', () => {
  assert.deepEqual(verifiedOutcome({ status: 'VERIFIED' }), { code: STOP_CODE.GOAL_ACHIEVED, success: true, detail: null });
  assert.equal(verifiedOutcome({ status: 'NOT_VERIFIED', reason: 'NO_STATE_CHANGE' }).code, VERIFY_CODE.FAILED);
  assert.equal(verifiedOutcome({ status: 'NOT_VERIFIED', reason: 'STALE_OBSERVATION' }).code, VERIFY_CODE.FAILED);
  assert.equal(verifiedOutcome({ status: 'NOT_VERIFIED', reason: 'NO_ACTION_TAKEN' }).code, VERIFY_CODE.INCONCLUSIVE);
  for (const v of [null, undefined, {}, { status: 'verified' }, { status: 'MAYBE' }, 'VERIFIED']) {
    const r = verifiedOutcome(v);
    assert.equal(r.success, false);
    assert.equal(r.code, VERIFY_CODE.UNAVAILABLE);
  }
  assert.equal(verifiedOutcome({ status: 'NOT_VERIFIED', reason: 'Error: at secret@x' }).detail, null);
});

// --- controller orchestration -------------------------------------------------------

function ok({ action = 'CLICK', observationId = 'obs_1', signature = 'sig_' + observationId,
  reason = action === 'STOP' ? GOAL_ACHIEVED_REASON : 'A suitable visual target is visible.' } = {}) {
  const plan = { action, target: action === 'CLICK' ? 'visual_1' : null, observationId, reason };
  return { observeStatus: 'READY', observationId, context: { marker: observationId }, planner: { status: 'READY', plan },
    ticket: action === 'CLICK' ? { observationId, target: 'visual_1' } : null,
    targetText: action === 'CLICK' ? 'Continue' : null, signature, measurements: {} };
}
async function drive(steps, verifyResult, { cancelled = () => false } = {}) {
  const events = [], calls = [];
  let i = 0, executed = 0;
  const r = await runAgent('goal', {
    observePlan: async () => steps[Math.min(i++, steps.length - 1)],
    execute: async () => { executed++; return { status: 'EXECUTED' }; },
    verifyResult: verifyResult && (async (op, lastAction) => { calls.push({ op, lastAction }); return verifyResult(op, lastAction); }),
    settle: async () => {}, emit: (e) => events.push(e), cancelled,
  });
  return { ...r, events, calls, executed };
}
const CLICK_THEN_ACHIEVED = [ok(), ok({ action: 'STOP', observationId: 'obs_2' })];
const snapshotOf = (events) => events.reduce(reduceAgentSnapshot, initialAgentSnapshot());

test('1/8/13: CLICK -> re-observe -> GOAL_ACHIEVED -> verification PASS -> COMPLETED on the fresh state', async () => {
  const r = await drive(CLICK_THEN_ACHIEVED, async () => ({ status: 'VERIFIED' }));
  assert.equal(r.state, AGENT_STATE.COMPLETED);
  assert.equal(r.reason, STOP_CODE.GOAL_ACHIEVED);
  assert.equal(r.calls.length, 1);
  // The verifier gets the CURRENT post-action observation, bound to the pre-action one.
  const { op, lastAction } = r.calls[0];
  assert.equal(op.observationId, 'obs_2');
  assert.deepEqual(op.context, { marker: 'obs_2' });
  assert.equal(lastAction.actionObservationId, 'obs_1');
  assert.equal(lastAction.beforeSignature, 'sig_obs_1');
  assert.ok(Number.isFinite(lastAction.dispatchedAt));
  const names = r.events.map((e) => e.event);
  assert.deepEqual(names.slice(-4), ['PLAN_READY', 'VERIFICATION_STARTED', 'VERIFICATION_RESULT', 'AGENT_COMPLETED']);
  const result = r.events.find((e) => e.event === 'VERIFICATION_RESULT');
  assert.deepEqual(Object.keys(result).sort(), ['detail', 'event', 'ms', 'reason', 'runId', 'status', 'step']);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(snapshotOf(r.events).state, 'COMPLETED');
});

test('2/14: GOAL_ACHIEVED + verification FAIL => STOPPED, snapshot never COMPLETED', async () => {
  const r = await drive(CLICK_THEN_ACHIEVED, async () => ({ status: 'NOT_VERIFIED', reason: 'NO_STATE_CHANGE' }));
  assert.equal(r.state, AGENT_STATE.STOPPED);
  assert.equal(r.reason, VERIFY_CODE.FAILED);
  const result = r.events.find((e) => e.event === 'VERIFICATION_RESULT');
  assert.deepEqual([result.status, result.detail], ['NOT_VERIFIED', 'NO_STATE_CHANGE']);
  const snap = snapshotOf(r.events);
  assert.deepEqual([snap.active, snap.state, snap.outcomeCode], [false, 'STOPPED', 'VERIFICATION_FAILED']);
});

test('3: verifier unavailable (missing, throwing, or no verdict) => never COMPLETED', async () => {
  for (const verifier of [undefined, async () => { throw new Error('secret@x boom'); }, async () => undefined]) {
    const r = await drive(CLICK_THEN_ACHIEVED, verifier);
    assert.equal(r.state, AGENT_STATE.STOPPED);
    assert.equal(r.reason, VERIFY_CODE.UNAVAILABLE);
    assert.ok(!JSON.stringify(r.events).includes('secret@x'));
  }
});

test('4: non-success STOP does not run verification', async () => {
  const r = await drive([ok(), ok({ action: 'STOP', observationId: 'obs_2', reason: 'No suitable visual target is available.' })],
    async () => ({ status: 'VERIFIED' }));
  assert.equal(r.calls.length, 0);
  assert.equal(r.state, AGENT_STATE.STOPPED);
  assert.equal(r.reason, STOP_CODE.NO_TARGET);
  assert.ok(!r.events.some((e) => e.event.startsWith('VERIFICATION')));
});

test('5/6: planner unavailable or privacy failure do not run verification', async () => {
  for (const [step, reason] of [
    [{ observeStatus: 'READY', observationId: 'obs_2', planner: { status: 'UNAVAILABLE' } }, 'PLANNER_UNAVAILABLE'],
    [{ observeStatus: 'FAILED', observeReason: 'PRIVACY_FAILED' }, 'PRIVACY_FAILED'],
  ]) {
    const r = await drive([ok(), step], async () => ({ status: 'VERIFIED' }));
    assert.equal(r.calls.length, 0);
    assert.equal(r.state, AGENT_STATE.FAILED);
    assert.equal(r.reason, reason);
  }
});

test('7: stale observation cannot complete the task', async () => {
  const r = await drive(CLICK_THEN_ACHIEVED, async () => ({ status: 'NOT_VERIFIED', reason: 'STALE_OBSERVATION' }));
  assert.equal(r.state, AGENT_STATE.STOPPED);
  assert.equal(r.reason, VERIFY_CODE.FAILED);
});

test('GOAL_ACHIEVED before any action => inconclusive, verifier sees no action reference', async () => {
  const r = await drive([ok({ action: 'STOP' })], async (_op, lastAction) => verifyStateChange(approved(['x']), lastAction));
  assert.equal(r.executed, 0);
  assert.equal(r.calls[0].lastAction, null);
  assert.equal(r.state, AGENT_STATE.STOPPED);
  assert.equal(r.reason, VERIFY_CODE.INCONCLUSIVE);
});

test('cancel during verification => CANCELLED, not COMPLETED', async () => {
  let cancel = false;
  const r = await drive(CLICK_THEN_ACHIEVED, async () => { cancel = true; return { status: 'VERIFIED' }; },
    { cancelled: () => cancel });
  assert.equal(r.state, AGENT_STATE.CANCELLED);
});

// --- real service worker + real verifier ------------------------------------------

const known = 'synthetic-sensitive@example.invalid';
const raw = 'data:image/png;base64,AA==';

test('worker: planner success completes only when the fresh page really changed (9, 12, 13, 14)', async () => {
  let listener, clicks = 0, runCalls = 0, pageChanges = true;
  const broadcasts = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const context = JSON.parse(options.body);
    const click = runCalls++ === 0;
    return { ok: true, headers: { get: () => 'ai' }, json: async () => ({
      schemaVersion: 1, observationId: context.observation.id,
      action: click ? 'CLICK' : 'STOP', target: click ? context.actionCandidates[0] : null,
      reason: click ? 'A suitable visual target is visible.' : GOAL_ACHIEVED_REASON }) };
  };
  globalThis.chrome = {
    runtime: {
      id: 'test', getURL: (p) => 'chrome-extension://test/' + p,
      onMessage: { addListener(fn) { listener = fn; } },
      getContexts: async () => [{}],
      sendMessage: async (message) => {
        if (message.target !== 'ocr-host') { broadcasts.push(message); return; }
        return { ok: true, result: { data: { text: known, blocks: [{ paragraphs: [{ lines: [
          { text: known, confidence: 90, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 } },
          { text: pageChanges ? ['Next', 'Saved'][clicks % 2] : 'Next', confidence: 95, bbox: { x0: 5, y0: 60, x1: 60, y1: 80 } },
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
  await import('../src/background/service-worker.js?phase-13c');
  const sender = { id: 'test', url: 'chrome-extension://test/src/popup/popup.html' };
  const send = (message) => new Promise((resolve) => listener(message, sender, resolve));
  const verificationEvents = () => broadcasts.filter((b) => b.update?.event?.startsWith('VERIFICATION'));

  // Success: CLICK changes the page; planner claims success; local verifier agrees.
  const good = await send({ type: MSG.RUN_TASK, goal: 'submit it' });
  assert.equal(good.summary.state, 'COMPLETED');
  assert.equal(good.summary.reason, 'GOAL_ACHIEVED');
  assert.equal(verificationEvents().at(-1).update.status, 'VERIFIED');
  const goodState = await send({ type: MSG.GET_AGENT_STATE });
  assert.deepEqual([goodState.state, goodState.outcomeCode], ['COMPLETED', 'GOAL_ACHIEVED']);
  await new Promise((r) => setImmediate(r));

  // Failure: the click has no visible effect, yet the planner still claims success.
  pageChanges = false; runCalls = 0;
  const bad = await send({ type: MSG.RUN_TASK, goal: 'submit it' });
  assert.equal(clicks, 2);
  assert.equal(bad.summary.state, 'STOPPED');
  assert.equal(bad.summary.reason, 'VERIFICATION_FAILED');
  const failed = verificationEvents().at(-1).update;
  assert.deepEqual([failed.status, failed.detail], ['NOT_VERIFIED', 'NO_STATE_CHANGE']);
  const badState = await send({ type: MSG.GET_AGENT_STATE });
  assert.deepEqual([badState.active, badState.state, badState.outcomeCode], [false, 'STOPPED', 'VERIFICATION_FAILED']);

  // Verification events and state carry no page/OCR/PII text.
  const text = JSON.stringify([verificationEvents(), goodState, badState]);
  for (const secret of [known, 'Saved', 'Next', 'submit it', raw]) assert.ok(!text.includes(secret), secret);
  globalThis.fetch = originalFetch;
});

// --- popup --------------------------------------------------------------------------

async function popup() {
  const html = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
  const log = [];
  const make = (id) => ({ textContent: '', disabled: false, listeners: {},
    classList: { add() {}, remove() {} }, addEventListener(t, fn) { this.listeners[t] = fn; },
    append(row) { if (id === 'agent-log') log.push(row.textContent); } });
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((m) => [m[1], make(m[1])]));
  let listener;
  const chrome = { runtime: { id: 'extension-test', onMessage: { addListener(fn) { listener = fn; } },
    sendMessage: (m) => Promise.resolve(m.type === MSG.GET_VERIFICATION ? { status: 'WAITING' } : { active: false, state: 'IDLE' }) } };
  const source = (await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8'))
    .replace("import { MSG } from '../shared/messages.js';", '');
  vm.runInNewContext(source, { MSG, chrome, document: { getElementById: (id) => elements.get(id), createElement: () => make() },
    window: { addEventListener() {} }, setTimeout, clearTimeout });
  await Promise.resolve();
  return { el: (id) => elements.get(id), log,
    update: (update) => listener({ type: MSG.AGENT_UPDATE, update }, { id: 'extension-test' }) };
}

test('popup: result verification line, and failed verification never reads TASK COMPLETE', async () => {
  const p = await popup();
  p.update({ event: 'VERIFICATION_RESULT', runId: 'r', step: 2, status: 'VERIFIED', reason: 'GOAL_ACHIEVED' });
  p.update({ event: 'VERIFICATION_RESULT', runId: 'r', step: 2, status: 'NOT_VERIFIED', reason: 'VERIFICATION_FAILED' });
  assert.deepEqual(p.log, ['Step 2: result verification VERIFIED', 'Step 2: result verification NOT VERIFIED']);
  for (const code of Object.values(VERIFY_CODE)) {
    p.update({ event: 'AGENT_STOPPED', runId: 'r', state: 'STOPPED', reason: code });
    assert.equal(p.el('agent-status').textContent, 'TASK STOPPED');
    assert.doesNotMatch(p.el('agent-note').textContent, /complete/i);
    assert.match(p.el('agent-note').textContent, /not confirmed|nothing could be verified/i);
  }
  p.update({ event: 'AGENT_COMPLETED', runId: 'r', state: 'COMPLETED', reason: 'GOAL_ACHIEVED' });
  assert.equal(p.el('agent-status').textContent, 'TASK COMPLETE');
});
