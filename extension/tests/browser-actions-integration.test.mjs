import test from 'node:test';
import assert from 'node:assert/strict';
import { MSG } from '../src/shared/messages.js';

// Actual service worker, privacy transaction, candidate metadata, transport, tickets
// and controller. Browser/OCR/provider are doubles: this is NOT live AI evidence.
test('wired NAVIGATE -> TYPE -> ENTER -> SCROLL -> STOP uses fresh observations and safe metadata', async () => {
  const originals = new Map(['chrome', 'fetch', 'createImageBitmap', 'OffscreenCanvas'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const known = 'synthetic-sensitive@example.invalid';
  const raw = 'data:image/png;base64,AA==';
  const requests = [], dispatches = [], events = [];
  let listener, url = 'https://start.invalid/', generation = 1, typed = '', focused = false, scrollY = 0;
  const sequence = ['NAVIGATE', 'TYPE', 'PRESS_KEY', 'SCROLL', 'STOP'];
  const onUpdated = { listeners: new Set(), addListener(fn) { this.listeners.add(fn); }, removeListener(fn) { this.listeners.delete(fn); } };
  const onRemoved = { ...onUpdated, listeners: new Set() };
  const rect = { x: 20, y: 90, width: 240, height: 40 };
  globalThis.fetch = async (_url, options) => {
    const context = JSON.parse(options.body);
    assert.ok(!options.body.includes(known)); assert.ok(!options.body.includes(raw));
    assert.ok(!/controlId|fieldId|signature/.test(options.body));
    assert.equal(context.privacy.sensitiveFieldCount, 1);
    assert.equal(context.privacy.rawPiiIncluded, false);
    const candidate = context.visualElements.find(v => context.actionCandidates.includes(v.id));
    assert.equal(candidate.role, 'searchbox'); assert.equal(candidate.editable, true);
    assert.equal(candidate.focused, focused);
    assert.equal(context.pageOrigin, new URL(url).origin);
    const action = sequence[requests.length];
    requests.push(context);
    const params = { NAVIGATE: { url: 'https://library.invalid/search' },
      TYPE: { target: candidate.id, text: 'calculus videos' }, PRESS_KEY: { key: 'ENTER' },
      SCROLL: { direction: 'DOWN', amount: 'MEDIUM' }, STOP: { target: null } }[action];
    return { ok: true, headers: { get: () => 'ai' }, json: async () => ({ schemaVersion: 1,
      observationId: context.observation.id, action, ...params, reason: 'A suitable visual target is visible.' }) };
  };
  globalThis.chrome = {
    runtime: { id: 'test', getURL: p => 'chrome-extension://test/' + p,
      onMessage: { addListener: fn => { listener = fn; } }, getContexts: async () => [{}],
      sendMessage: async message => {
        if (message.target !== 'ocr-host') { events.push(message.update); return; }
        return { ok: true, result: { data: { text: typed || 'Search videos', blocks: [{ paragraphs: [{ lines: [
          { text: known, confidence: 95, bbox: { x0: 10, y0: 10, x1: 100, y1: 30 } },
          { text: typed || 'Search videos', confidence: 95, bbox: { x0: 35, y0: 95, x1: 240, y1: 125 } },
        ] }] }] }, width: 300, height: 200, timing: { cold: false, initializationMs: 1, inferenceMs: 1, totalMs: 2 } } };
      } },
    permissions: { contains: async () => true },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
    tabs: { onUpdated, onRemoved,
      query: async () => [{ id: 1, windowId: 1, url }],
      get: async () => ({ id: 1, windowId: 1, url, status: 'complete' }), captureVisibleTab: async () => raw,
      update: async (_id, opts) => { url = opts.url; generation++; dispatches.push({ action: 'NAVIGATE', generation }); },
    },
    scripting: { executeScript: async ({ target, func, args }) => {
      const documentId = 'document-' + generation;
      if (target.documentIds) assert.deepEqual(target.documentIds, [documentId], 'old-page ticket reused');
      if (func.name === 'documentBindingInPage') return [{ result: true }];
      if (func.name === 'observePage') return [{ documentId, result: {
        counts: { inputs: 2, buttons: 0, labels: 2 }, viewport: { width: 300, height: 200 },
        devicePixelRatio: 1, visualViewport: { scale: 1, x: 0, y: 0 }, position: { x: 0, y: scrollY }, buttonRects: [],
        controls: [{ controlId: 'control_2', fieldId: 'field_2', role: 'searchbox', editable: true, supported: true, focused, signature: 'search-structure', rect },
          { controlId: 'private', fieldId: 'field_1', role: 'input', editable: true, supported: true, focused: false, rect: { x: 10, y: 10, width: 90, height: 20 } }],
        fieldSignals: [{ id: 'field_1', type: 'email', label: 'Email', rect: { x: 10, y: 10, width: 90, height: 20 } },
          { id: 'field_2', type: 'search', label: 'Search', rect }],
      } }];
      if (func.name === 'collectLocalValues') return [{ result: [{ id: 'field_1', value: known }, { id: 'field_2', value: typed }] }];
      assert.equal(func.name, 'browserActionInPage');
      const [action, plan] = args;
      dispatches.push({ action, generation });
      if (action === 'TYPE') { typed = plan.text; focused = true; }
      if (action === 'PRESS_KEY') { url = 'https://library.invalid/search?q=calculus'; generation++; focused = false; }
      if (action === 'SCROLL') scrollY += 120;
      return [{ result: { status: 'EXECUTED' } }];
    } },
  };
  globalThis.createImageBitmap = async () => ({ width: 300, height: 200, close() {} });
  globalThis.OffscreenCanvas = class {
    getContext() { return { drawImage() {}, fillRect() {} }; }
    async convertToBlob() { return new Blob(['x']); }
  };
  try {
    await import('../src/background/service-worker.js?vocabulary-integration');
    const response = await new Promise(resolve => listener({ type: MSG.RUN_TASK, goal: 'Search for calculus videos.' },
      { id: 'test', url: 'chrome-extension://test/src/popup/popup.html' }, resolve));
    assert.equal(response.summary.state, 'COMPLETED');
    assert.deepEqual(dispatches.map(d => d.action), sequence.slice(0, -1));
    assert.deepEqual(dispatches.map(d => d.generation), [2, 2, 2, 3]);
    assert.equal(new Set(requests.map(c => c.observation.id)).size, 5);
    assert.equal(events.filter(e => e?.event === 'REOBSERVATION_READY').length, 4);
    assert.deepEqual(response.summary.timings.map(t => t.action), sequence);
  } finally {
    for (const [k, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, k, descriptor) : delete globalThis[k];
  }
});
