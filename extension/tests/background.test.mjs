import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MSG } from '../src/shared/messages.js';

test('worker integration: guarded result, repeat run, changed page and capture failures', async () => {
  let listener, mode = 'success', observations = 0, captures = 0;
  const raw = 'data:image/png;base64,AA==';
  const known = 'synthetic-sensitive@example.invalid';
  globalThis.chrome = {
    runtime: { id: 'test', getURL: (path) => 'chrome-extension://test/' + path, onMessage: { addListener(fn) { listener = fn; } } },
    tabs: {
      async query() { return [{ id: 1, windowId: 1 }]; },
      async captureVisibleTab() { captures++; if (mode === 'capture-error') throw new Error(known); return raw; },
    },
    scripting: {
      async executeScript({ func }) {
        if (func.name === 'observePage') {
          observations++;
          return [{ documentId: 'document-1', result: {
            counts: { inputs: 1, buttons: 1, labels: 1 }, viewport: { width: 200, height: 100 },
            devicePixelRatio: 1, visualViewport: { scale: 1, x: 0, y: 0 },
            fieldSignals: [{ id: 'field_1', type: 'email', label: known, rect: {
              x: mode === 'changed-page' ? observations : 10, y: 10, width: 50, height: 20,
            } }],
          } }];
        }
        return [{ result: [{ id: 'field_1', value: known }] }];
      },
    },
  };
  globalThis.createImageBitmap = async () => ({ width: 200, height: 100, close() {} });
  globalThis.OffscreenCanvas = class {
    drawn = 0;
    getContext() { return { drawImage() {}, fillRect: () => this.drawn++ }; }
    async convertToBlob() { return new Blob(['synthetic-canvas-' + this.drawn]); }
  };
  await import('../src/background/service-worker.js');
  const sender = { id: 'test', url: 'chrome-extension://test/src/popup/popup.html' };
  const analyze = () => new Promise((resolve) => listener({ type: MSG.ANALYZE_PAGE }, sender, resolve));
  for (let i = 0; i < 2; i++) {
    const response = await analyze();
    assert.equal(response.ok, true);
    assert.equal(response.privacy.outbound, 'SAFE');
    assert.equal(response.privacy.redactedRegions, 1);
    assert.equal(response.perception.status, 'ERROR'); // unavailable offscreen API degrades gracefully
    assert.ok(!JSON.stringify(response).includes(known));
    assert.ok(!JSON.stringify(response).includes(raw));
    assert.ok(!('localPreview' in response.safeContext));
    await new Promise((resolve) => setImmediate(resolve));
  }
  for (const failure of ['changed-page', 'capture-error']) {
    mode = failure;
    const response = await analyze();
    assert.equal(response.ok, false);
    assert.ok(!JSON.stringify(response).includes(known));
    assert.ok(!('safeContext' in response));
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(captures, 4);
  mode = 'success';
  chrome.runtime.getContexts = async () => [{}];
  chrome.offscreen = { createDocument: async () => {}, closeDocument: async () => {} };
  chrome.runtime.sendMessage = async ({ image, target }) => {
    assert.equal(target, 'ocr-host'); assert.equal(image.dataUrl, raw);
    return { ok: true, result: { data: { text: known, blocks: [{ paragraphs: [{ lines: [
      { text: known, confidence: 90, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 } },
      { text: 'Continue', confidence: 95, bbox: { x0: 5, y0: 60, x1: 60, y1: 80 } },
    ] }] }] }, width: 200, height: 100,
    timing: { cold: true, initializationMs: 10, inferenceMs: 10, totalMs: 20 } } };
  };
  const filtered = await analyze();
  assert.equal(filtered.ok, true);
  assert.equal(filtered.perception.status, 'Ready');
  assert.equal(filtered.privacy.outbound, 'SAFE');
  assert.equal(filtered.perception.value.withheldItems, 1);
  assert.deepEqual(filtered.safeContext.visual.items.map((item) => item.text), ['Continue']);
  assert.notEqual(filtered.safeContext.image.dataUrl, raw);
  assert.ok(!JSON.stringify(filtered).includes(known));
  await new Promise((resolve) => setImmediate(resolve));
  // A known value fragmented across individually retained lines still revokes the
  // candidate package and previews at the final privacy gateway.
  chrome.runtime.sendMessage = async () => ({ ok: true, result: { width: 200, height: 100,
    timing: { cold: false, initializationMs: 0, inferenceMs: 10, totalMs: 10 },
    data: { text: known, blocks: [{ paragraphs: [{ lines: known.split('@').map((text) => ({
      text, confidence: 90, bbox: { x0: 5, y0: 60, x1: 195, y1: 80 },
    })) }] }] } } });
  const blocked = await analyze();
  assert.equal(blocked.perception.status, 'UNSAFE');
  assert.equal(blocked.privacy.outbound, 'BLOCKED');
  assert.equal(blocked.safeContext, null);
  assert.deepEqual(blocked.localPreview, {});
  assert.ok(!JSON.stringify(blocked).includes(known));
  await new Promise((resolve) => setImmediate(resolve));
  let finishOcr;
  chrome.runtime.sendMessage = async () => new Promise((resolve) => { finishOcr = resolve; });
  const running = analyze();
  await new Promise((resolve) => setImmediate(resolve));
  const overlapping = await analyze();
  assert.equal(overlapping.ok, false);
  finishOcr({ ok: true, result: { width: 200, height: 100,
    timing: { cold: false, initializationMs: 0, inferenceMs: 10, totalMs: 10 },
    data: { text: 'Continue', blocks: [{ paragraphs: [{ lines: [{ text: 'Continue', confidence: 95,
      bbox: { x0: 5, y0: 60, x1: 50, y1: 80 } }] }] }] } } });
  const ready = await running;
  assert.equal(ready.perception.status, 'Ready');
  assert.equal(ready.safeContext.visual.items[0].text, 'Continue');
  assert.ok(!JSON.stringify(ready).includes(known));
  assert.equal(listener({ type: MSG.ANALYZE_PAGE }, { id: 'test', url: 'https://untrusted.invalid' }, () => {}), false);
});

test('extension has no network transport and CSP blocks connections', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'self'"));
  assert.ok(manifest.content_security_policy.extension_pages.includes("worker-src 'self'"));
  assert.ok(!/https?:|unsafe-inline|'unsafe-eval'/.test(manifest.content_security_policy.extension_pages));
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'offscreen']);
  const { readdir } = await import('node:fs/promises');
  const root = new URL('../src/', import.meta.url);
  for (const file of await readdir(root, { recursive: true })) {
    if (!file.endsWith('.js')) continue;
    const normalized = file.replaceAll('\\', '/');
    const code = await readFile(new URL(normalized, root), 'utf8');
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(code), `Unexpected transport in ${file}`);
    assert.ok(!/chrome\.storage|localStorage|indexedDB/.test(code), `Unexpected retention in ${file}`);
    // Sanitized OCR diagnostics are intentionally centralized in a single audited
    // sink so a real Chrome failure is debuggable; every other source file stays
    // log-free. The sink emits only stage, error class and a truncated library
    // message — never screenshot pixels, recognized text or known secrets.
    if (normalized !== 'perception/diagnostics.js') {
      assert.ok(!/console\./.test(code), `Unexpected logging outside the diagnostics sink in ${file}`);
    }
  }
});
