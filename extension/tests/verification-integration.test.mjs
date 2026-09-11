import test from 'node:test';
import assert from 'node:assert/strict';
import { observeLocal } from '../src/background/local-observation.js';
import { verifyAfterClick } from '../src/verification/verify-after-click.js';
import { MSG } from '../src/shared/messages.js';

const canaries = ['Synthetic Person', 'synthetic@example.invalid', '5550101234', 'EMP1024', 'synthetic-password'];
const phrase = 'Travel Request Submitted';
function harness(t) {
  const previous = Object.fromEntries(['chrome', 'createImageBitmap', 'OffscreenCanvas', 'fetch'].map((k) => [k, globalThis[k]]));
  const logs = [], originalLog = console.info, originalError = console.error;
  console.info = (...args) => logs.push(args.join(' ')); console.error = (...args) => logs.push(args.join(' '));
  const state = { post: false, mode: 'success', captures: [], ocr: [], events: [], scripts: [], masks: 0, network: 0, clicks: 0, updates: [], logs };
  const tab = () => ({ id: 1, windowId: 2, url: state.post ? 'https://new.invalid/' : 'https://old.invalid/' });
  globalThis.chrome = {
    runtime: { id: 'test', getURL: (path) => 'chrome-extension://test/' + path,
      getContexts: async () => [{}], onMessage: { addListener: (fn) => { state.listener = fn; } },
      sendMessage: async (message) => {
        if (message.type === MSG.VERIFICATION_UPDATE) { state.updates.push(message); return; }
        state.events.push('ocr'); state.ocr.push(message.image.dataUrl);
        if (state.post && state.mode === 'ocr-error') throw Error(canaries[4]);
        assert.equal(message.image.width, state.post ? 1000 : 800);
        const text = state.post ? (state.mode === 'no-match' ? 'Travel Request Pending' : phrase) : state.preText || 'Continue';
        const lines = [text, ...canaries].map((text, i) => ({ text, confidence: 94,
          bbox: { x0: 10, y0: 200 + i * 25, x1: 350, y1: 220 + i * 25 } }));
        if (state.post && state.mode === 'empty') lines.length = 0;
        if (state.post && state.mode === 'fragmented-secret') {
          lines.push(...['Synthetic', 'Person'].map((text) => ({ text, confidence: 95,
            bbox: { x0: 10, y0: 370, x1: 350, y1: 390 } })));
        }
        return { ok: true, result: { width: state.post ? 1000 : 800, height: 500,
          data: { text: lines.map((l) => l.text).join('\n'), blocks: [{ paragraphs: [{ lines }] }] },
          timing: { cold: !state.post, initializationMs: 0, inferenceMs: 1, totalMs: 1 } } };
      } },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
    tabs: { get: async () => { if (state.mode === 'missing') throw Error(canaries[0]); return tab(); },
      query: async () => [{ ...tab(), id: state.mode === 'switched' ? 9 : 1 }],
      captureVisibleTab: async () => {
        state.events.push('capture');
        if (state.mode === 'capture-error') throw Error(canaries[1]);
        const raw = 'data:image/png;base64,' + btoa(state.post ? 'fresh-pixels' : 'old-pixels');
        state.captures.push(raw);
        if (state.mode === 'switch-during-capture') state.mode = 'switched';
        return raw;
      } },
    scripting: { executeScript: async ({ target, func }) => {
      state.scripts.push({ target, name: func.name });
      if (func.name === 'clickInPage') { state.clicks++; state.post = true; state.events.push('click'); return [{ result: { status: 'EXECUTED' } }]; }
      const documentId = state.post ? 'new-document' : 'old-document';
      if (target.documentIds) assert.deepEqual(target.documentIds, [documentId]);
      if (func.name === 'observePage') return [{ documentId, result: {
        counts: { inputs: 5, labels: 5, buttons: 1 }, viewport: { width: 800, height: 500 },
        devicePixelRatio: 1, visualViewport: { scale: 1, x: 0, y: 0 },
        buttonRects: state.post ? [] : [{ rect: { x: 0, y: 190, width: 400, height: 40 } }],
        // Even the post-action fixture contains private inputs: every stage must rerun.
        fieldSignals: ['name', 'email', 'tel', 'employee_id', 'password'].map((role, i) => ({
          id: `field_${i + 1}`, type: role, name: role, label: canaries[i],
          rect: { x: 10 + i * 100, y: 10, width: 80, height: 20 },
        })),
      } }];
      return [{ result: canaries.map((value, i) => ({ id: `field_${i + 1}`, value })) }];
    } },
  };
  globalThis.createImageBitmap = async () => {
    if (state.mode === 'redaction-error') throw Error(canaries[0]);
    return { width: state.post ? 1000 : 800, height: 500, close() {} };
  };
  globalThis.OffscreenCanvas = class {
    getContext() { return { drawImage() {}, fillRect() { state.masks++; } }; }
    async convertToBlob() { return new Blob(['sanitized-fixture']); }
  };
  globalThis.fetch = async (_url, opts) => {
    state.network++;
    const ctx = JSON.parse(opts.body);
    assert.deepEqual(ctx.actionCandidates, [ctx.visualElements[0].id]);
    return { ok: true, json: async () => ({ schemaVersion: 1, observationId: ctx.observation.id,
      action: 'CLICK', target: ctx.visualElements[0].id, reason: 'Deterministic test suggestion.' }) };
  };
  t.after(() => { Object.assign(globalThis, previous); console.info = originalLog; console.error = originalError; });
  state.tab = tab;
  state.verify = () => verifyAfterClick({ observationId: 'obs_old', tabId: 1, windowId: 2,
    documentId: 'old-document', url: 'https://old.invalid/' }, Date.now() - 1000, { delay: async () => {} });
  return state;
}

test('real shared pipeline recaptures new pixels, OCR, dimensions, IDs and privacy with zero network', async (t) => {
  const h = harness(t);
  const old = await observeLocal(h.tab(), '');
  const oldId = old.result.agentContext.observation.id;
  const oldMasks = h.masks;
  h.post = true;
  const result = await h.verify();
  assert.equal(result.status, 'VERIFIED');
  assert.equal(h.captures.length, 2); assert.equal(h.ocr.length, 2);
  assert.notEqual(h.captures[0], h.captures[1]); assert.deepEqual(h.captures, h.ocr);
  assert.notEqual(oldId, result.verificationObservationId);
  assert.equal(old.result.capture.width, 800);
  assert.ok(h.masks > oldMasks); assert.equal(result.privacy, 'SAFE');
  assert.deepEqual(result.evidence.visualIds, ['visual_1']); // regenerated; scoped by NEW observation
  assert.equal(h.network, 0); assert.equal(h.clicks, 0);
  const fusionLogs = h.logs.filter((line) => line.includes('ACTION_FUSION'));
  assert.equal(fusionLogs.length, 2);
  for (const line of fusionLogs) {
    assert.match(line, /^\[EdgeSight OCR\] service-worker ACTION_FUSION buttons=\d+ controls=\d+ items=\d+ candidates=\d+$/);
  }
  for (const value of canaries) {
    assert.ok(!JSON.stringify(result).includes(value)); assert.ok(!h.logs.join(' ').includes(value));
  }
  assert.ok(!JSON.stringify(result).includes(h.captures[1]));
});

for (const [mode, reason] of [['capture-error', 'CAPTURE_FAILED'], ['ocr-error', 'PERCEPTION_FAILED'],
  ['redaction-error', 'PRIVACY_FAILED'], ['fragmented-secret', 'PRIVACY_FAILED'],
  ['switched', 'TAB_CHANGED'], ['missing', 'TAB_CHANGED'], ['switch-during-capture', 'TAB_CHANGED'],
  ['empty', 'NO_VISUAL_MATCH'], ['no-match', 'NO_VISUAL_MATCH']]) {
  test(`fresh pipeline failure ${mode} is safe and has zero network/actions/retries`, async (t) => {
    const h = harness(t); h.post = true; h.mode = mode;
    const result = await h.verify();
    assert.equal(result.status, 'NOT_VERIFIED'); assert.equal(result.reason, reason);
    assert.equal(h.network, 0); assert.equal(h.clicks, 0); assert.ok(h.captures.length <= 1);
    for (const secret of canaries) {
      assert.ok(!JSON.stringify(result).includes(secret)); assert.ok(!h.logs.join(' ').includes(secret));
    }
    if (['switched', 'missing'].includes(mode)) assert.equal(h.captures.length, 0);
  });
}

test('worker Execute automatically observes AFTER dispatch, publishes progress, retains only safe result', async (t) => {
  const h = harness(t);
  await import('../src/background/service-worker.js?phase8');
  const sender = { id: 'test', url: 'chrome-extension://test/src/popup/popup.html' };
  const send = (type) => new Promise((resolve) => h.listener({ type }, sender, resolve));
  const analysis = await send(MSG.ANALYZE_PAGE);
  assert.equal(analysis.planner.status, 'READY');
  await new Promise((r) => setImmediate(r));
  const start = Date.now();
  const pending = send(MSG.EXECUTE_ACTION);
  await new Promise((r) => setImmediate(r));
  assert.equal((await send(MSG.ANALYZE_PAGE)).ok, false);
  assert.equal((await send(MSG.EXECUTE_ACTION)).status, 'BLOCKED');
  const executed = await pending;
  assert.equal(executed.status, 'EXECUTED'); assert.equal(executed.verification.status, 'VERIFIED');
  assert.ok(Date.now() - start >= 700);
  assert.deepEqual(h.events, ['capture', 'ocr', 'click', 'capture', 'ocr']);
  assert.equal(h.network, 1); // ONLY the explicit initial Analyze / Plan
  assert.equal(h.clicks, 1);
  assert.notEqual(analysis.agentContext.observation.id, executed.verification.verificationObservationId);
  assert.equal(executed.verification.actionObservationId, analysis.agentContext.observation.id);
  assert.deepEqual(h.updates.map((m) => m.verification.status), ['VERIFYING', 'VERIFIED']);
  assert.deepEqual(await send(MSG.GET_VERIFICATION), executed.verification);
  const payloads = JSON.stringify([executed, h.updates]);
  for (const secret of canaries) assert.ok(!payloads.includes(secret));
  assert.ok(!/dataUrl|rawScreenshot|rawOCR|localPreview|fieldSignals/.test(payloads));
  await new Promise((r) => setImmediate(r));
  assert.equal((await send(MSG.EXECUTE_ACTION)).status, 'BLOCKED');
  assert.equal(h.captures.length, 2); assert.equal(h.network, 1); assert.equal(h.clicks, 1);
});

test('success phrase in pre-action OCR is never reused when fresh pixels miss', async (t) => {
  const h = harness(t); h.preText = phrase;
  const old = await observeLocal(h.tab(), '');
  assert.equal(old.result.agentContext.visualElements[0].text, phrase);
  h.post = true; h.mode = 'no-match';
  const result = await h.verify();
  assert.equal(result.reason, 'NO_VISUAL_MATCH'); assert.equal(h.ocr.length, 2);
  assert.equal(h.network, 0);
});

test('actual OCR deadline closes hung host and reports NOT VERIFIED without network', async (t) => {
  const h = harness(t); h.post = true;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let entered, closed = false;
  const ready = new Promise((r) => { entered = r; });
  chrome.runtime.sendMessage = async () => { entered(); return new Promise(() => {}); };
  chrome.offscreen.closeDocument = async () => { closed = true; };
  const pending = h.verify();
  await ready;
  t.mock.timers.tick(45_001);
  const result = await pending;
  assert.equal(result.status, 'NOT_VERIFIED'); assert.equal(result.reason, 'PERCEPTION_FAILED');
  assert.equal(closed, true); assert.equal(h.network, 0); assert.equal(h.clicks, 0);
});

test('Phase 9 actual worker timings stay local and machine total excludes confirmation interval', async (t) => {
  const h = harness(t);
  let ticks = 0;
  t.mock.method(performance, 'now', () => ++ticks);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    assert.ok(!/measurements|planMs|humanConfirmation|machineTotal/.test(options.body));
    return realFetch(url, options);
  };
  await import('../src/background/service-worker.js?phase9-metrics');
  const sender = { id: 'test', url: 'chrome-extension://test/src/popup/popup.html' };
  const send = (type) => new Promise((resolve) => h.listener({ type }, sender, resolve));
  const analysis = await send(MSG.ANALYZE_PAGE);
  for (const key of ['captureMs', 'detectionMs', 'redactionMs', 'semanticGuardMs', 'visualGuardMs',
    'contextGuardMs', 'localTotalMs', 'perceptionMs', 'plannerRoundTripMs', 'actionPreparationMs', 'planMs']) {
    assert.ok(analysis.measurements[key] > 0, key);
  }
  assert.equal(analysis.measurements.safeContextBytes, new TextEncoder().encode(JSON.stringify(analysis.agentContext)).length);
  assert.equal(analysis.measurements.screenshotWidth, 800);
  assert.equal(analysis.measurements.sanitizedPngBytes, new TextEncoder().encode('sanitized-fixture').length);
  await new Promise((r) => setImmediate(r)); ticks += 9000;
  const executed = await send(MSG.EXECUTE_ACTION);
  const m = executed.verification.measurements;
  assert.equal(m.machineTotalMs, m.planMs + m.postExecutionMs);
  assert.ok(m.humanConfirmationMs >= 9000); assert.ok(m.machineTotalMs < 9000);
  assert.ok(m.clickDispatchMs > 0); assert.ok(m.verificationMs > 0);
  assert.equal(h.network, 1); assert.equal(h.clicks, 1);
  for (const secret of canaries) assert.ok(!JSON.stringify(m).includes(secret));
});
