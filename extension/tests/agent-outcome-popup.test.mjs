// Phase 13A — the popup must never render a non-success terminal state as
// TASK COMPLETE. The controller decides the state; this pins the rendering, so
// a future edit to the label logic cannot quietly reintroduce a false success.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MSG } from '../src/shared/messages.js';
import { STOP_CODE } from '../src/shared/outcome-contract.js';

async function popup() {
  const html = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
  const make = () => ({
    textContent: '', disabled: false, listeners: {},
    classList: { add() {}, remove() {} },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    append() {},
  });
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((m) => [m[1], make()]));
  let listener;
  const chrome = { runtime: { id: 'extension-test', onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message) {
      return message.type === MSG.GET_VERIFICATION
        ? Promise.resolve({ status: 'WAITING' }) : new Promise(() => {});
    } } };
  const source = (await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8'))
    .replace("import { MSG } from '../shared/messages.js';", '');
  vm.runInNewContext(source, { MSG, chrome, document: {
    getElementById: (id) => { assert.ok(elements.has(id), `Popup element ${id} exists`); return elements.get(id); },
    createElement: () => make(),
  }, window: { addEventListener() {} }, setTimeout, clearTimeout });
  await Promise.resolve();
  return {
    el: (id) => elements.get(id),
    // Deliver a terminal agent event exactly as the service worker relays it.
    terminal: (state, reason) => listener(
      { type: MSG.AGENT_UPDATE, update: {
        event: state === 'COMPLETED' ? 'AGENT_COMPLETED' : state === 'FAILED' ? 'AGENT_FAILED' : 'AGENT_STOPPED',
        state, reason } },
      { id: 'extension-test' }),
  };
}

test('popup: achieved-goal STOP is the only thing that renders TASK COMPLETE', async () => {
  const p = await popup();
  p.terminal('COMPLETED', STOP_CODE.GOAL_ACHIEVED);
  assert.equal(p.el('agent-status').textContent, 'TASK COMPLETE');
  assert.match(p.el('agent-note').textContent, /goal achieved/i);
});

// Every non-success terminal reason the controller can produce.
const NON_SUCCESS = [
  ['STOPPED', STOP_CODE.NO_TARGET, 'TASK STOPPED'],
  ['STOPPED', STOP_CODE.UNSAFE, 'TASK STOPPED'],
  ['STOPPED', STOP_CODE.NO_PROGRESS, 'TASK STOPPED'],
  ['STOPPED', STOP_CODE.UNSUPPORTED_GOAL, 'TASK STOPPED'],
  ['STOPPED', STOP_CODE.INCOMPLETE_CONTEXT, 'TASK STOPPED'],
  ['STOPPED', STOP_CODE.UNCLASSIFIED, 'TASK STOPPED'],
  ['STOPPED', 'MAX_STEPS', 'TASK STOPPED'],
  ['STOPPED', 'LOOP_DETECTED', 'TASK STOPPED'],
  ['FAILED', 'PLANNER_UNAVAILABLE', 'TASK FAILED'],
  ['FAILED', 'PRIVACY_FAILED', 'TASK FAILED'],
  ['FAILED', 'PERCEPTION_FAILED', 'TASK FAILED'],
  ['FAILED', 'OBSERVE_FAILED', 'TASK FAILED'],
  ['FAILED', 'INVALID_TARGET', 'TASK FAILED'],
  ['FAILED', 'ACTION_FAILED', 'TASK FAILED'],
  ['CANCELLED', 'CANCELLED', 'TASK CANCELLED'],
];

for (const [state, reason, expected] of NON_SUCCESS) {
  test(`popup: ${state}/${reason} renders "${expected}", never TASK COMPLETE`, async () => {
    const p = await popup();
    p.terminal(state, reason);
    const label = p.el('agent-status').textContent;
    assert.equal(label, expected);
    assert.notEqual(label, 'TASK COMPLETE');
    // The explanatory note must not imply success either.
    assert.doesNotMatch(p.el('agent-note').textContent, /task complete/i);
  });
}

test('popup: an unmapped reason code still refuses to imply success', async () => {
  const p = await popup();
  p.terminal('STOPPED', 'SOME_FUTURE_CODE');
  assert.equal(p.el('agent-status').textContent, 'TASK STOPPED');
  assert.doesNotMatch(p.el('agent-note').textContent, /complete/i);
});
