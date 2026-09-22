// Action-target accuracy. Live regression: on the travel form the planner chose
// CLICK "Bengaluru" — the OCR'd VALUE inside an editable text input, which grounds
// (correctly) as a TYPE-capable control. Editable => TYPE-only; only a non-editable
// control may be clicked. Nothing here keys off specific page text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSafeAgentContext } from '../src/privacy/agent-context.js';
import { validateAction } from '../src/shared/action-contract.js';
import { MSG } from '../src/shared/messages.js';

const GOAL = 'Check whether this travel request is complete and submit it.';

function liveShape() {
  const item = (text, y) => ({ text, bbox: { x: 10, y, width: 120, height: 20 }, confidence: 0.95 });
  return buildSafeAgentContext({ goal: GOAL, semantic: { fields: [] },
    visualState: { items: [item('Travel Request', 10), item('Bengaluru', 60), item('Continue', 110)]
      .map((v, i) => ({ ...v, id: `visual_${i + 1}` })) },
    actionCandidates: ['visual_2', 'visual_3'],
    candidateMetadata: {
      visual_2: { role: 'input', editable: true, focused: false },
      visual_3: { role: 'button', editable: false, focused: false },
    },
    image: { width: 400, height: 200, redactedRegions: 0 },
    observation: { id: 'obs_1', capturedAt: new Date().toISOString(), viewport: { width: 400, height: 200 } },
    sensitiveValues: [] }).context;
}
const plan = (fields) => ({ schemaVersion: 1, observationId: 'obs_1', reason: 'A suitable visual target is visible.', ...fields });

test('1/3: an editable field value is not CLICK-capable', () => {
  assert.throws(() => validateAction(plan({ action: 'CLICK', target: 'visual_2' }), liveShape()), /Plan rejected/);
});

test('2: an actual button is CLICK-capable', () => {
  assert.equal(validateAction(plan({ action: 'CLICK', target: 'visual_3' }), liveShape()).target, 'visual_3');
});

test('3: the editable field stays TYPE-capable; the button is not TYPE-capable', () => {
  assert.equal(validateAction(plan({ action: 'TYPE', target: 'visual_2', text: 'travel request' }), liveShape()).action, 'TYPE');
  assert.throws(() => validateAction(plan({ action: 'TYPE', target: 'visual_3', text: 'travel request' }), liveShape()));
});

test('5: non-interactive OCR text stays as context but is never an executable target', () => {
  const ctx = liveShape();
  assert.ok(ctx.visualElements.some((v) => v.id === 'visual_1'));
  assert.ok(!ctx.actionCandidates.includes('visual_1'));
  assert.throws(() => validateAction(plan({ action: 'CLICK', target: 'visual_1' }), ctx));
});

// 4/6: the real observation pipeline (same observeAndPlan as the autonomous loop) on a
// live-shaped DOM. The planner returns whatever we script; the client must accept only
// the generic CLICK-capable control.
test('4/6: live-shaped form grounds value as TYPE-only and the submit control as CLICK-capable', async () => {
  let listener, answer = 'value';
  const logs = [], sent = [];
  const originals = { fetch: globalThis.fetch, info: console.info };
  console.info = (line) => logs.push(String(line));
  globalThis.fetch = async (_url, options) => {
    const context = JSON.parse(options.body);
    sent.push(context);
    const byText = (t) => context.visualElements.find((v) => v.text === t)?.id;
    const target = answer === 'value' ? byText('Bengaluru') : byText('Continue');
    return { ok: true, headers: { get: () => 'ai' }, json: async () => ({ schemaVersion: 1,
      observationId: context.observation.id, action: 'CLICK', target, reason: 'A suitable visual target is visible.' }) };
  };
  const input = { x: 20, y: 50, width: 200, height: 30 }, button = { x: 20, y: 120, width: 100, height: 30 };
  globalThis.chrome = {
    runtime: { id: 'test', getURL: (p) => 'chrome-extension://test/' + p,
      onMessage: { addListener(fn) { listener = fn; } }, getContexts: async () => [{}],
      sendMessage: async (message) => {
        if (message.target !== 'ocr-host') return;
        return { ok: true, result: { width: 400, height: 200,
          timing: { cold: false, initializationMs: 1, inferenceMs: 1, totalMs: 2 },
          data: { text: '', blocks: [{ paragraphs: [{ lines: [
            { text: 'Travel Request', confidence: 95, bbox: { x0: 20, y0: 10, x1: 200, y1: 30 } },
            { text: 'Bengaluru', confidence: 95, bbox: { x0: 25, y0: 55, x1: 120, y1: 75 } },
            { text: 'Continue', confidence: 95, bbox: { x0: 30, y0: 125, x1: 110, y1: 145 } },
          ] }] }] } } };
      } },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
    tabs: { query: async () => [{ id: 1, windowId: 1, url: 'https://demo.invalid/form' }],
      get: async () => ({ id: 1, windowId: 1, url: 'https://demo.invalid/form' }),
      captureVisibleTab: async () => 'data:image/png;base64,AA==' },
    scripting: { executeScript: async ({ func }) => {
      if (func.name === 'observePage') return [{ documentId: 'document-1', result: {
        counts: { inputs: 1, buttons: 1, labels: 1 }, viewport: { width: 400, height: 200 },
        devicePixelRatio: 1, visualViewport: { scale: 1, x: 0, y: 0 }, buttonRects: [],
        controls: [
          { controlId: 'control_1', fieldId: 'field_1', role: 'input', editable: true, supported: true, focused: false, signature: 'a', rect: input },
          { controlId: 'control_2', fieldId: null, role: 'button', editable: false, supported: true, focused: false, signature: 'b', rect: button },
        ],
        fieldSignals: [{ id: 'field_1', type: 'text', label: 'Destination', rect: input }],
      } }];
      return [{ result: [{ id: 'field_1', value: 'Bengaluru' }] }];
    } },
  };
  globalThis.createImageBitmap = async () => ({ width: 400, height: 200, close() {} });
  globalThis.OffscreenCanvas = class {
    getContext() { return { drawImage() {}, fillRect() {} }; }
    async convertToBlob() { return new Blob(['x']); }
  };
  try {
    await import('../src/background/service-worker.js?grounding');
    const sender = { id: 'test', url: 'chrome-extension://test/src/popup/popup.html' };
    const analyze = () => new Promise((resolve) => listener({ type: MSG.ANALYZE_PAGE, goal: GOAL }, sender, resolve));

    const first = await analyze();
    const ctx = first.agentContext;
    const byText = (t) => ctx.visualElements.find((v) => v.text === t);
    // Grounding: the value is a TYPE-only candidate, the button is CLICK-capable, the heading is context.
    assert.deepEqual([byText('Bengaluru').role, byText('Bengaluru').editable], ['input', true]);
    assert.deepEqual([byText('Continue').role, byText('Continue').editable], ['button', false]);
    assert.ok(!ctx.actionCandidates.includes(byText('Travel Request').id));
    // Candidate metadata reaches the planner (sent context carries role/editable).
    assert.equal(sent[0].visualElements.find((v) => v.text === 'Continue').role, 'button');
    // The planner's CLICK on the field value is rejected: nothing becomes executable.
    assert.notEqual(first.planner.status, 'READY');
    assert.equal(first.execution.available, false);
    // Safe diagnostic: capability counts only.
    assert.ok(logs.some((l) => /ACTION_FUSION .*candidates=2 clickable=1 typeable=1/.test(l)));
    assert.ok(!logs.some((l) => /Bengaluru|Continue|Destination/.test(l)));

    await new Promise((r) => setImmediate(r));
    answer = 'button';
    const second = await analyze();
    assert.equal(second.planner.status, 'READY');
    assert.equal(second.planner.plan.target, second.agentContext.visualElements.find((v) => v.text === 'Continue').id);
    assert.equal(second.execution.available, true);
  } finally {
    globalThis.fetch = originals.fetch;
    console.info = originals.info;
  }
});
