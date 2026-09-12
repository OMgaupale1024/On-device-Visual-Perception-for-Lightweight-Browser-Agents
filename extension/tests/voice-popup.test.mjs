import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MSG } from '../src/shared/messages.js';

// Runs the real popup.js against DOM/chrome doubles, optionally injecting a fake
// SpeechRecognition so the voice path is exercised without a browser.
async function popup({ speech = true } = {}) {
  const html = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((m) => [m[1], {
    textContent: '', value: '', disabled: false, width: 0, height: 0, complete: false, naturalWidth: 0, listeners: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    removeAttribute() {}, setAttribute() {}, getAttribute() { return null; }, append() {},
    getContext() { return { drawImage() {}, strokeRect() {} }; },
  }]));
  let listener;
  const calls = [];
  const chrome = { runtime: { id: 'extension-test', onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message) { calls.push(message); return message.type === MSG.GET_VERIFICATION
      ? Promise.resolve({ status: 'WAITING' }) : Promise.resolve({ ok: true, summary: { state: 'COMPLETED', reason: 'PLANNER_STOP' } }); } } };

  const instances = [];
  class FakeRecognition {
    constructor() { this.started = false; instances.push(this); }
    start() { if (this.throwOnStart) throw new Error('start failed'); this.started = true; }
    result(transcript) { this.onresult?.({ results: [[{ transcript }]] }); this.onend?.(); }
    error() { this.onerror?.({ error: 'no-speech' }); this.onend?.(); }
  }
  const window = { addEventListener() {} };
  if (speech) window.webkitSpeechRecognition = FakeRecognition;

  const source = (await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8'))
    .replace("import { MSG } from '../shared/messages.js';", '');
  vm.runInNewContext(source, { MSG, chrome, window, document: { getElementById: (id) => {
    assert.ok(elements.has(id), `Popup element ${id} exists`); return elements.get(id);
  } }, setTimeout, clearTimeout, performance: { now: () => 0 } });
  await Promise.resolve();
  const el = (id) => elements.get(id);
  return { el, calls, instances,
    clickMic: () => el('mic').listeners.click?.(),
    clickRun: () => el('run-task').listeners.click?.() };
}

test('typed goal still starts the normal run via the existing controller path', async () => {
  const p = await popup();
  p.el('goal').value = 'Check whether this travel request is complete and submit it.';
  await p.clickRun();
  await Promise.resolve();
  const run = p.calls.find((c) => c.type === MSG.RUN_TASK);
  assert.ok(run, 'RUN_TASK sent');
  assert.equal(run.goal, 'Check whether this travel request is complete and submit it.');
});

test('voice transcript populates the SAME goal input and does not auto-run', async () => {
  const p = await popup();
  await p.clickMic();
  assert.equal(p.el('voice-status').textContent, 'Listening…');
  assert.equal(p.instances.length, 1);
  p.instances[0].result('open youtube and search for calculus videos');
  assert.equal(p.el('goal').value, 'open youtube and search for calculus videos');
  assert.match(p.el('voice-status').textContent, /Voice ready/);
  // Voice must never trigger the controller by itself.
  assert.equal(p.calls.filter((c) => c.type === MSG.RUN_TASK).length, 0);
  // Mic state resets so a new capture is possible.
  assert.equal(p.el('mic').disabled, false);
  assert.equal(p.el('mic').classList.contains('listening'), false);
});

test('voice then RUN TASK feeds the transcript through the existing controller', async () => {
  const p = await popup();
  await p.clickMic();
  p.instances[0].result('search for calculus videos');
  await p.clickRun();
  await Promise.resolve();
  const run = p.calls.find((c) => c.type === MSG.RUN_TASK);
  assert.equal(run.goal, 'search for calculus videos');
});

test('empty transcript is rejected and no run starts', async () => {
  const p = await popup();
  p.el('goal').value = 'existing goal';
  await p.clickMic();
  p.instances[0].result('   ');
  assert.equal(p.el('goal').value, 'existing goal'); // unchanged
  assert.match(p.el('voice-status').textContent, /No speech detected/);
  assert.equal(p.calls.filter((c) => c.type === MSG.RUN_TASK).length, 0);
});

test('recognition error resets mic state and starts no run', async () => {
  const p = await popup();
  await p.clickMic();
  p.instances[0].error();
  assert.match(p.el('voice-status').textContent, /error/i);
  assert.equal(p.el('mic').disabled, false);
  assert.equal(p.el('mic').classList.contains('listening'), false);
  assert.equal(p.calls.filter((c) => c.type === MSG.RUN_TASK).length, 0);
});

test('unsupported SpeechRecognition disables mic but leaves text mode working', async () => {
  const p = await popup({ speech: false });
  assert.equal(p.el('mic').disabled, true);
  assert.match(p.el('voice-status').textContent, /unavailable/i);
  p.el('goal').value = 'typed goal still works';
  await p.clickRun();
  await Promise.resolve();
  assert.equal(p.calls.find((c) => c.type === MSG.RUN_TASK).goal, 'typed goal still works');
});
