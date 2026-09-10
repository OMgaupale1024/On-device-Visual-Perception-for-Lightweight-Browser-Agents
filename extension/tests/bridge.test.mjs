import test from 'node:test';
import assert from 'node:assert/strict';
import { inferLocally } from '../src/perception/bridge.js';
import { OCR_TIMEOUT_MS } from '../src/perception/config.js';
import { perceiveLocalCapture } from '../src/perception/pipeline.js';

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

test('host failure surfaces a stage-tagged diagnostic while the thrown error stays generic', async () => {
  // Regression for the Chrome integration black hole: an offscreen fault used to
  // collapse into { ok: false } with no stage/class, so the real browser error was
  // unknowable. The stage + error class must now reach the service-worker console.
  const errors = [];
  const original = { error: console.error, info: console.info };
  console.error = (line) => errors.push(String(line));
  console.info = () => {};
  try {
    chrome.runtime.getContexts = async () => [{}];
    chrome.runtime.sendMessage = async () => ({ ok: false, diag: { stage: 'OCR_WORKER_CREATE', name: 'RuntimeError', message: 'WebAssembly.instantiate failed' } });
    chrome.offscreen.closeDocument = async () => {};
    await assert.rejects(inferLocally({ dataUrl: 'x', width: 1, height: 1 }), /Local OCR unavailable or timed out/);
    assert.ok(errors.some((l) => l.includes('OCR_WORKER_CREATE') && l.includes('RuntimeError')), 'stage + error class logged for Chrome debugging');
  } finally {
    console.error = original.error; console.info = original.info;
  }
});

test('local pipeline rejects result dimensions inconsistent with capture', async () => {
  chrome.runtime.sendMessage = async () => ({ ok: true, result: { width: 2, height: 1 } });
  const result = await perceiveLocalCapture({ dataUrl: 'data:image/png;base64,AA==', width: 1, height: 1 }, [], []);
  assert.equal(result.status, 'ERROR');
  assert.ok(!('value' in result));
});

test('bounded local activity runs only while OCR is pending', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let contextCalls = 0, finish;
  chrome.runtime.getContexts = async () => { contextCalls++; return [{}]; };
  chrome.runtime.sendMessage = async () => new Promise((resolve) => { finish = resolve; });
  const pending = inferLocally({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(contextCalls, 1);
  t.mock.timers.tick(10_000);
  assert.equal(contextCalls, 2);
  finish({ ok: true, result: {} });
  await pending;
  t.mock.timers.tick(20_000);
  assert.equal(contextCalls, 2);
});
