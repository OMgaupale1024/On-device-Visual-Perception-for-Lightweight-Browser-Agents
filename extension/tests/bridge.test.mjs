import test from 'node:test';
import assert from 'node:assert/strict';
import { inferLocally } from '../src/perception/bridge.js';
import { OCR_TIMEOUT_MS } from '../src/perception/config.js';

test('offscreen host reuses initialized context and forwards only image payload', async () => {
  let creates = 0, contexts = [];
  const image = { dataUrl: 'data:image/png;base64,AA==', width: 1, height: 1 };
  globalThis.chrome = {
    runtime: { getURL: (path) => 'chrome-extension://test/' + path,
      getContexts: async () => contexts,
      sendMessage: async (message) => { assert.deepEqual(Object.keys(message).sort(), ['image', 'target', 'type']); assert.deepEqual(message.image, image); return { ok: true, result: { safeTestOnly: true } }; } },
    offscreen: { createDocument: async ({ reasons }) => { assert.deepEqual(reasons, ['WORKERS']); creates++; contexts = [{}]; } },
  };
  await inferLocally(image); await inferLocally(image);
  assert.equal(creates, 1);
});
test('missing local engine / WASM failure closes host and reports only generic error', async () => {
  let closed = false;
  chrome.runtime.sendMessage = async () => ({ ok: false });
  chrome.offscreen.closeDocument = async () => { closed = true; };
  await assert.rejects(inferLocally({}), /Local OCR unavailable or timed out/);
  assert.ok(closed);
});
test('timeout destroys a hung host so next analysis can retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let closed = false;
  chrome.runtime.sendMessage = async () => new Promise(() => {});
  chrome.offscreen.closeDocument = async () => { closed = true; };
  const pending = inferLocally({});
  const rejected = assert.rejects(pending, /Local OCR unavailable or timed out/);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(OCR_TIMEOUT_MS + 1);
  await rejected;
  assert.ok(closed);
});
