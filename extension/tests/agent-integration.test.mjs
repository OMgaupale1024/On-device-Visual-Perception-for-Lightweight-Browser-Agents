import test from 'node:test';
import assert from 'node:assert/strict';
import { MSG } from '../src/shared/messages.js';

// Drives the wired autonomous loop through the real service-worker: observe → plan
// → validate → execute → re-observe → STOP, with the same privacy pipeline as manual
// mode. Planner returns CLICK on the first call and STOP after the click (Nemotron
// deciding the goal is done on the fresh page). Mocks mirror background.test.mjs.
test('RUN_TASK: autonomous CLICK then re-observe STOP completes without manual steps', async () => {
  let listener, plannerCalls = 0, clicks = 0, observations = 0;
  const raw = 'data:image/png;base64,AA==';
  const known = 'synthetic-sensitive@example.invalid';
  const bodies = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    plannerCalls++;
    const context = JSON.parse(options.body);
    bodies.push(options.body);
    assert.ok(!options.body.includes(known)); assert.ok(!options.body.includes(raw));
    // First live plan clicks the approved candidate; the re-observed page then STOPs.
    const click = plannerCalls === 1;
    return { ok: true, headers: { get: () => 'ai' }, json: async () => ({
      schemaVersion: 1, observationId: context.observation.id,
      action: click ? 'CLICK' : 'STOP', target: click ? context.actionCandidates[0] : null,
      // The re-observed page reports the goal achieved: the only reason that completes.
      reason: click ? 'A suitable visual target is visible.' : 'The goal is already achieved.' }) };
  };
  globalThis.chrome = {
    runtime: {
      id: 'test', getURL: (p) => 'chrome-extension://test/' + p,
      onMessage: { addListener(fn) { listener = fn; } },
      getContexts: async () => [{}],
      sendMessage: async ({ target }) => {
        if (target !== 'ocr-host') return; // AGENT_UPDATE / verification broadcasts: ignore
        return { ok: true, result: { data: { text: known, blocks: [{ paragraphs: [{ lines: [
          { text: known, confidence: 90, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 } },
          // Each click visibly changes the page (Phase 13C verifies a fresh, changed state).
          { text: ['Continue', 'Done'][clicks % 2], confidence: 95, bbox: { x0: 5, y0: 60, x1: 60, y1: 80 } },
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
          observations++;
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
  const summary = await new Promise((resolve) =>
    listener({ type: MSG.RUN_TASK, goal: 'submit it' }, sender, (r) => resolve(r)));

  assert.equal(summary.ok, true);
  assert.equal(summary.summary.state, 'COMPLETED');
  assert.equal(summary.summary.reason, 'GOAL_ACHIEVED');
  assert.equal(summary.summary.step, 2);      // step 1 clicked, step 2 re-observed and STOPped
  assert.equal(plannerCalls, 2);              // planner consulted on each fresh observation
  assert.equal(clicks, 1);                    // exactly one guarded click dispatched
  assert.ok(observations >= 4);               // two observe transactions, each double-snapshots
  assert.ok(bodies.every((b) => !b.includes(known)));

  // A second run works after the first ends (agentActive released in finally()).
  await new Promise((r) => setImmediate(r));
  plannerCalls = 0;
  const again = await new Promise((resolve) =>
    listener({ type: MSG.RUN_TASK, goal: 'submit it' }, sender, (r) => resolve(r)));
  assert.equal(again.summary.state, 'COMPLETED');
  globalThis.fetch = originalFetch;
});
