// Live regression: ACTION_FUSION buttons=1 controls=2 ... candidates=1 clickable=0 typeable=1.
// Full-screen OCR left the real submit button without ANY text item (light text on a dark
// fill), and grounding is item-driven, so the DOM button never became a candidate. A
// clickable DOM control with no OCR item is now re-read from its own pixels. DOM decides
// interactivity; the label still comes from pixels. Nothing keys off specific page text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverUnreadControls } from '../src/perception/pipeline.js';
import { actionableVisualIds } from '../src/actions/geometry.js';
import { MSG } from '../src/shared/messages.js';

const button = { x: 20, y: 120, width: 100, height: 30 };
const item = (id, text, bbox, confidence = 0.95) => ({ id, text, bbox, confidence });
const value = (items) => ({ items });
function reader(texts, calls = []) {
  return async (_image, regions) => {
    calls.push(regions);
    return regions.map((r, i) => ({ id: r.id, ...(texts[i] ?? { text: '', confidence: null }) }));
  };
}

test('2: a clickable control with no OCR item is recovered from its own pixels', async () => {
  const calls = [];
  const out = await recoverUnreadControls({}, value([item('visual_3', 'Heading', { x: 20, y: 10, width: 120, height: 20 })]),
    [], [], [button], { refine: reader([{ text: 'Submit', confidence: 0.93 }], calls) });
  assert.equal(calls.length, 1);
  const added = out.items.at(-1);
  assert.deepEqual(added, { id: 'visual_4', text: 'Submit', bbox: button, confidence: 0.93 });
  assert.deepEqual(actionableVisualIds(out.items, [button]), ['visual_4']);
});

test('1: a control that full-screen OCR already read is not re-read', async () => {
  const calls = [];
  const items = [item('visual_1', 'Submit', { x: 30, y: 125, width: 80, height: 20 })];
  const out = await recoverUnreadControls({}, value(items), [], [], [button], { refine: reader([], calls) });
  assert.equal(calls.length, 0);
  assert.equal(out.items.length, 1);
});

test('fail closed: unsafe, empty or low-confidence pixel reads add nothing', async () => {
  for (const read of [{ text: 'someone@example.com', confidence: 0.99 }, { text: 'Rahul Sharma', confidence: 0.99 },
    { text: '   ', confidence: 0.99 }, { text: 'Submit', confidence: 0.2 }, { text: 'Submit', confidence: null }]) {
    const base = value([]);
    const out = await recoverUnreadControls({}, base, ['Rahul Sharma'], [], [button], { refine: reader([read]) });
    assert.equal(out, base, JSON.stringify(read));
  }
});

test('7: zero-size (hidden) or sensitive-overlapping regions are never read', async () => {
  const calls = [];
  const hidden = { x: 5, y: 5, width: 0, height: 0 };
  const sensitive = [{ x: 15, y: 115, width: 60, height: 40 }];
  const out = await recoverUnreadControls({}, value([]), [], sensitive, [hidden, button], { refine: reader([], calls) });
  assert.equal(calls.length, 0);
  assert.deepEqual(out.items, []);
});

test('6: nearby OCR text outside the button does not attach to it; the button is read separately', async () => {
  const outside = item('visual_1', 'Terms apply', { x: 20, y: 160, width: 120, height: 20 });
  assert.deepEqual(actionableVisualIds([outside], [button]), []);
  const out = await recoverUnreadControls({}, value([outside]), [], [], [button], { refine: reader([{ text: 'Submit', confidence: 0.9 }]) });
  assert.deepEqual(actionableVisualIds(out.items, [button]), ['visual_2']);
});

test('recovery is capped per observation', async () => {
  const calls = [];
  const many = Array.from({ length: 6 }, (_, i) => ({ x: 10, y: 10 + i * 40, width: 80, height: 30 }));
  await recoverUnreadControls({}, value([]), [], [], many, { refine: reader([], calls) });
  assert.equal(calls[0].length, 3);
});

// Real service worker + real grounding on the live shape. Full-screen OCR returns the
// heading and the field value but NOTHING on the button; the per-control pixel read does.
test('live shape: 1/2/3/4/5/8 — button and link recovered as CLICK candidates, input stays TYPE-only', async () => {
  let listener, mode = 'button';
  const logs = [], refineRequests = [];
  const originals = { fetch: globalThis.fetch, info: console.info };
  console.info = (line) => logs.push(String(line));
  globalThis.fetch = async (_url, options) => {
    const context = JSON.parse(options.body);
    const target = context.visualElements.find((v) => v.role === 'button' || v.role === 'link')?.id;
    return { ok: true, headers: { get: () => 'ai' }, json: async () => ({ schemaVersion: 1,
      observationId: context.observation.id, action: 'CLICK', target, reason: 'The next action advances the goal.' }) };
  };
  const input = { x: 20, y: 50, width: 200, height: 30 };
  const clickable = () => mode === 'link'
    ? { controlId: 'control_2', fieldId: null, role: 'link', editable: false, supported: true, focused: false, signature: 'l', rect: button }
    : { controlId: 'control_2', fieldId: null, role: 'button', editable: false, supported: true, focused: false, signature: 'b', rect: button };
  globalThis.chrome = {
    runtime: { id: 'test', getURL: (p) => 'chrome-extension://test/' + p,
      onMessage: { addListener(fn) { listener = fn; } }, getContexts: async () => [{}],
      sendMessage: async (message) => {
        if (message.target !== 'ocr-host') return;
        if (message.type === 'EDGESIGHT_LOCAL_OCR_REFINE') {
          refineRequests.push(message.regions.map((r) => r.bbox));
          return { ok: true, result: { refinements: message.regions.map((r) => ({ id: r.id, text: 'Proceed', confidence: 0.91 })) } };
        }
        return { ok: true, result: { width: 400, height: 200,
          timing: { cold: false, initializationMs: 1, inferenceMs: 1, totalMs: 2 },
          data: { text: '', blocks: [{ paragraphs: [{ lines: [
            { text: 'Request form', confidence: 95, bbox: { x0: 20, y0: 10, x1: 200, y1: 30 } },
            { text: 'Bengaluru', confidence: 95, bbox: { x0: 25, y0: 55, x1: 120, y1: 75 } },
            { text: 'Terms apply', confidence: 95, bbox: { x0: 20, y0: 160, x1: 140, y1: 180 } },
          ] }] }] } } };
      } },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
    tabs: { query: async () => [{ id: 1, windowId: 1, url: 'https://demo.invalid/form' }],
      get: async () => ({ id: 1, windowId: 1, url: 'https://demo.invalid/form' }),
      captureVisibleTab: async () => 'data:image/png;base64,AA==' },
    scripting: { executeScript: async ({ func }) => {
      if (func.name === 'observePage') return [{ documentId: 'document-1', result: {
        counts: { inputs: 1, buttons: 1, labels: 1 }, viewport: { width: 400, height: 200 },
        devicePixelRatio: 1, visualViewport: { scale: 1, x: 0, y: 0 },
        buttonRects: mode === 'link' ? [] : [{ rect: button }],
        controls: [
          { controlId: 'control_1', fieldId: 'field_1', role: 'input', editable: true, supported: true, focused: false, signature: 'a', rect: input },
          clickable(),
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
    await import('../src/background/service-worker.js?fusion');
    const sender = { id: 'test', url: 'chrome-extension://test/src/popup/popup.html' };
    const analyze = () => new Promise((resolve) => listener({ type: MSG.ANALYZE_PAGE, goal: 'Submit the request.' }, sender, resolve));

    for (const role of ['button', 'link']) {
      mode = role;
      refineRequests.length = 0; logs.length = 0;
      const res = await analyze();
      const ctx = res.agentContext;
      const byText = (t) => ctx.visualElements.find((v) => v.text === t);
      // 2/3: the unread clickable control was re-read from its own pixels (only it: never the input).
      assert.deepEqual(refineRequests, [[button]], role);
      assert.deepEqual([byText('Proceed').role, byText('Proceed').editable, byText('Proceed').source], [role, false, 'visual']);
      assert.ok(ctx.actionCandidates.includes(byText('Proceed').id));
      // 4: the editable input stays TYPE-only.
      assert.deepEqual([byText('Bengaluru').role, byText('Bengaluru').editable], ['input', true]);
      // 5/6: plain text and nearby text are context only.
      assert.ok(!ctx.actionCandidates.includes(byText('Request form').id));
      assert.ok(!ctx.actionCandidates.includes(byText('Terms apply').id));
      // The live diagnostic now reads clickable=1 (numbers only, no text).
      assert.ok(logs.some((l) => /ACTION_FUSION .*candidates=2 clickable=1 typeable=1 recovered=1$/.test(l)), role);
      assert.ok(!logs.some((l) => /Proceed|Bengaluru|Destination|Terms/.test(l)));
      // 8: the CLICK plan is bound to THIS observation and becomes a local executable ticket.
      assert.equal(res.planner.status, 'READY', role);
      assert.equal(res.planner.plan.target, byText('Proceed').id);
      assert.equal(res.planner.plan.observationId, ctx.observation.id);
      assert.equal(res.execution.available, true);
      await new Promise((r) => setImmediate(r));
    }
  } finally {
    globalThis.fetch = originals.fetch;
    console.info = originals.info;
  }
});
