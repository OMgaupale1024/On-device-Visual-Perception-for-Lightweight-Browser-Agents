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
  assert.equal(listener({ type: MSG.ANALYZE_PAGE }, { id: 'test', url: 'https://untrusted.invalid' }, () => {}), false);
});

test('extension has no network transport and CSP blocks connections', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']);
  const { readdir } = await import('node:fs/promises');
  const root = new URL('../src/', import.meta.url);
  for (const file of await readdir(root, { recursive: true })) {
    if (!file.endsWith('.js')) continue;
    const code = await readFile(new URL(file.replaceAll('\\', '/'), root), 'utf8');
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(code), `Unexpected transport in ${file}`);
    assert.ok(!/console\.|chrome\.storage|localStorage|indexedDB/.test(code), `Unexpected retention/logging in ${file}`);
  }
});
