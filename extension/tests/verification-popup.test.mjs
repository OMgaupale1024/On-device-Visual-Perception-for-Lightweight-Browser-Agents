import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MSG } from '../src/shared/messages.js';

async function popup(initial = { status: 'WAITING' }) {
  const html = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((m) => [m[1], {
    textContent: '', disabled: false, listeners: {}, classList: { add() {}, remove() {} },
    addEventListener(type, fn) { this.listeners[type] = fn; },
  }]));
  let listener, finish;
  const calls = [];
  const chrome = { runtime: { id: 'extension-test', onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message) {
      calls.push(message.type);
      return message.type === MSG.GET_VERIFICATION ? Promise.resolve(initial) : new Promise((r) => { finish = r; });
    } } };
  const source = (await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8')).replace("import { MSG } from '../shared/messages.js';", '');
  vm.runInNewContext(source, { MSG, chrome, document: { getElementById: (id) => {
    assert.ok(elements.has(id), `Popup element ${id} exists`); return elements.get(id);
  } }, window: { addEventListener() {} }, setTimeout, clearTimeout });
  await Promise.resolve();
  return { elements, calls, finish: (value) => finish(value),
    update: (result, id = 'extension-test') => listener({ type: MSG.VERIFICATION_UPDATE, verification: result }, { id }) };
}

test('popup shows dispatch, VERIFYING and VISUALLY VERIFIED with expected evidence and distinct IDs', async () => {
  const p = await popup(); const el = (id) => p.elements.get(id);
  assert.equal(el('verification-status').textContent, 'Waiting for action');
  const pending = el('execute').listeners.click();
  p.update({ status: 'VERIFYING', actionObservationId: 'obs_before' });
  assert.equal(el('action-status').textContent, 'CLICK DISPATCHED');
  assert.equal(el('verification-status').textContent, 'VERIFYING');
  assert.equal(el('analyze').disabled, true);
  p.finish({ status: 'EXECUTED', verification: { status: 'VERIFIED', actionObservationId: 'obs_before',
    verificationObservationId: 'obs_after', privacy: 'SAFE', evidence: { expected: 'untrusted text ignored' } } });
  await pending;
  assert.equal(el('verification-status').textContent, 'VISUALLY VERIFIED');
  assert.equal(el('verification-evidence').textContent, 'Travel Request Submitted');
  assert.equal(el('verification-before').textContent, 'obs_before');
  assert.equal(el('verification-observation').textContent, 'obs_after');
  assert.equal(el('verification-privacy').textContent, 'SAFE');
  assert.equal(el('analyze').disabled, false);
  assert.deepEqual(p.calls, [MSG.GET_VERIFICATION, MSG.EXECUTE_ACTION]);
});
test('popup failure has Analyze again and no invented evidence/privacy; external messages ignored', async () => {
  const p = await popup();
  p.update({ status: 'VERIFIED' }, 'untrusted');
  assert.equal(p.elements.get('verification-status').textContent, 'Waiting for action');
  p.update({ status: 'NOT_VERIFIED', reason: 'TAB_CHANGED' });
  assert.equal(p.elements.get('verification-status').textContent, 'NOT VERIFIED');
  assert.equal(p.elements.get('verification-note').textContent, 'TAB_CHANGED — Analyze again');
  assert.equal(p.elements.get('verification-privacy').textContent, '–');
  assert.equal(p.elements.get('verification-evidence').textContent, '–');
  p.update({ status: 'NOT_VERIFIED', reason: 'synthetic-secret' });
  assert.equal(p.elements.get('verification-note').textContent, 'Analyze again');
});
test('reopening popup reads retained safe result without planning or executing', async () => {
  const p = await popup({ status: 'VERIFIED', verificationObservationId: 'obs_after', privacy: 'SAFE' });
  assert.equal(p.elements.get('verification-status').textContent, 'VISUALLY VERIFIED');
  assert.equal(p.elements.get('verification-observation').textContent, 'obs_after');
  assert.deepEqual(p.calls, [MSG.GET_VERIFICATION]);
});
