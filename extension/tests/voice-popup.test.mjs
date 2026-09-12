import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MSG } from '../src/shared/messages.js';

// Runs the real popup.js against DOM/chrome doubles, optionally injecting a fake
// SpeechRecognition and a fake navigator.mediaDevices.getUserMedia so the voice path is
// exercised without a browser.  media: 'grant' | 'deny' | 'nodevice' | 'nomediadevices'.
async function popup({ speech = true, media = 'grant' } = {}) {
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
    error(code = 'no-speech') { this.onerror?.({ error: code }); this.onend?.(); }
  }
  const gum = { calls: 0, stopped: 0 };
  const window = { addEventListener() {} };
  if (speech) window.webkitSpeechRecognition = FakeRecognition;
  const navigator = {};
  if (media !== 'nomediadevices') {
    navigator.mediaDevices = { getUserMedia: async () => {
      gum.calls++;
      if (media === 'deny') throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      if (media === 'nodevice') throw Object.assign(new Error('none'), { name: 'NotFoundError' });
      return { getTracks: () => [{ stop() { gum.stopped++; } }] };
    } };
  }

  const source = (await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8'))
    .replace("import { MSG } from '../shared/messages.js';", '');
  vm.runInNewContext(source, { MSG, chrome, window, navigator, document: { getElementById: (id) => {
    assert.ok(elements.has(id), `Popup element ${id} exists`); return elements.get(id);
  } }, setTimeout, clearTimeout, performance: { now: () => 0 } });
  await Promise.resolve();
  const el = (id) => elements.get(id);
  return { el, calls, instances, gum,
    clickMic: () => el('mic').listeners.click?.(),
    clickRun: () => el('run-task').listeners.click?.() };
}

test('goal input is editable by default (never disabled by voice setup)', async () => {
  const p = await popup();
  assert.equal(p.el('goal').disabled, false);
});

test('typed goal still starts the normal run via the existing controller path', async () => {
  const p = await popup();
  p.el('goal').value = 'Check whether this travel request is complete and submit it.';
  await p.clickRun();
  await Promise.resolve();
  const run = p.calls.find((c) => c.type === MSG.RUN_TASK);
  assert.ok(run, 'RUN_TASK sent');
  assert.equal(run.goal, 'Check whether this travel request is complete and submit it.');
});

test('mic click requests media permission before recognition and stops the temporary tracks', async () => {
  const p = await popup();
  await p.clickMic();
  assert.equal(p.gum.calls, 1, 'getUserMedia requested');
  assert.equal(p.gum.stopped, 1, 'temporary track stopped, no ongoing capture');
  assert.equal(p.instances.length, 1, 'recognition started after permission');
  assert.equal(p.instances[0].started, true);
  assert.equal(p.el('voice-status').textContent, 'Listening…');
});

test('voice transcript populates the SAME goal input and does not auto-run', async () => {
  const p = await popup();
  await p.clickMic();
  p.instances[0].result('open youtube and search for calculus videos');
  assert.equal(p.el('goal').value, 'open youtube and search for calculus videos');
  assert.match(p.el('voice-status').textContent, /Voice ready/);
  assert.equal(p.calls.filter((c) => c.type === MSG.RUN_TASK).length, 0);
  assert.equal(p.el('mic').disabled, false);
  assert.equal(p.el('mic').classList.contains('listening'), false);
  assert.equal(p.el('goal').disabled, false);
});

test('voice then RUN TASK feeds the transcript through the existing controller', async () => {
  const p = await popup();
  await p.clickMic();
  p.instances[0].result('search for calculus videos');
  await p.clickRun();
  await Promise.resolve();
  assert.equal(p.calls.find((c) => c.type === MSG.RUN_TASK).goal, 'search for calculus videos');
});

test('empty transcript is rejected and no run starts', async () => {
  const p = await popup();
  p.el('goal').value = 'existing goal';
  await p.clickMic();
  p.instances[0].result('   ');
  assert.equal(p.el('goal').value, 'existing goal');
  assert.match(p.el('voice-status').textContent, /No speech detected/);
  assert.equal(p.calls.filter((c) => c.type === MSG.RUN_TASK).length, 0);
});

test('permission denial shows a safe message, starts no run, and leaves goal input editable', async () => {
  const p = await popup({ media: 'deny' });
  await p.clickMic();
  assert.equal(p.instances.length, 0, 'recognition never started without permission');
  assert.match(p.el('voice-status').textContent, /permission denied/i);
  assert.equal(p.el('mic').disabled, false);
  assert.equal(p.el('goal').disabled, false);
  assert.equal(p.calls.filter((c) => c.type === MSG.RUN_TASK).length, 0);
  // Text still runs after a denial.
  p.el('goal').value = 'typed after denial';
  await p.clickRun();
  await Promise.resolve();
  assert.equal(p.calls.find((c) => c.type === MSG.RUN_TASK).goal, 'typed after denial');
});

test('no microphone present shows a safe fallback and leaves text mode working', async () => {
  const p = await popup({ media: 'nodevice' });
  await p.clickMic();
  assert.equal(p.instances.length, 0);
  assert.match(p.el('voice-status').textContent, /No microphone found/i);
  assert.equal(p.el('goal').disabled, false);
});

test('recognition error resets mic state and starts no run', async () => {
  const p = await popup();
  await p.clickMic();
  p.instances[0].error('network');
  assert.match(p.el('voice-status').textContent, /error/i);
  assert.equal(p.el('mic').disabled, false);
  assert.equal(p.el('mic').classList.contains('listening'), false);
  assert.equal(p.el('goal').disabled, false);
  assert.equal(p.calls.filter((c) => c.type === MSG.RUN_TASK).length, 0);
});

test('recognition not-allowed error maps to the permission-denied message', async () => {
  const p = await popup();
  await p.clickMic();
  p.instances[0].error('not-allowed');
  assert.match(p.el('voice-status').textContent, /permission denied/i);
  assert.equal(p.el('goal').disabled, false);
});

test('unsupported SpeechRecognition disables mic but leaves text mode working', async () => {
  const p = await popup({ speech: false });
  assert.equal(p.el('mic').disabled, true);
  assert.match(p.el('voice-status').textContent, /unavailable/i);
  assert.equal(p.el('goal').disabled, false);
  p.el('goal').value = 'typed goal still works';
  await p.clickRun();
  await Promise.resolve();
  assert.equal(p.calls.find((c) => c.type === MSG.RUN_TASK).goal, 'typed goal still works');
});
