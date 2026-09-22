import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlannerResponse } from '../src/transport/planner-client.js';
import { ticketForPlan, executeTicket, EXECUTION_TTL_MS } from '../src/actions/execute-click.js';
import { browserActionInPage, navigateTab } from '../src/actions/execute-browser.js';
import { runAgent } from '../src/background/agent-controller.js';
import { observePage } from '../src/content/observe.js';

const rect = { x: 20, y: 30, width: 100, height: 40 };
const control = { controlId: 'control_2', fieldId: 'field_2', role: 'searchbox', editable: true,
  focused: true, supported: true, signature: 'structure', rect };
const context = () => ({ goal: 'Search for calculus videos.',
  observation: { id: 'obs_current', viewport: { width: 800, height: 600 }, image: { width: 800, height: 600 } },
  visualElements: [{ id: 'visual_9', text: 'Search', bbox: rect, role: 'searchbox', editable: true, focused: true }],
  actionCandidates: ['visual_9'] });
const local = () => ({ tabId: 1, windowId: 2, documentId: 'document-original', url: 'https://example.org/',
  candidateControls: { visual_9: structuredClone(control) }, sensitiveRegions: [] });
const plan = fields => ({ schemaVersion: 1, observationId: 'obs_current', reason: 'A suitable visual target is visible.', ...fields });
const type = () => plan({ action: 'TYPE', target: 'visual_9', text: 'calculus videos' });
function harness({ field = {}, current = {}, blocked = false, cancelled = false } = {}) {
  const calls = [];
  const tab = { id: 1, windowId: 2, url: 'https://example.org/' };
  return { calls, deps: { now: () => 1000, getTab: async () => tab, queryActiveTab: async () => tab,
    cancelled: () => cancelled, canNavigate: async () => true,
    navigate: async (...args) => { calls.push({ navigation: args }); },
    executeScript: async options => {
      calls.push(options);
      if (blocked) throw new Error('document gone');
      if (options.func.name === 'documentBindingInPage') return [{ result: true }];
      return [{ documentId: 'document-original', result: options.func.name === 'observePage' ? {
        viewport: { width: 800, height: 600 }, controls: [{ ...control, ...current }],
        fieldSignals: [{ id: 'field_2', tag: 'input', type: 'search', label: 'Search', ...field }],
      } : { status: 'EXECUTED' } }];
    } } };
}

test('TYPE validates, binds the original document, executes once and cannot replay', async () => {
  const validated = validatePlannerResponse(type(), context());
  const ticket = ticketForPlan(validated, context(), local(), 1000);
  const { deps, calls } = harness();
  assert.equal((await executeTicket(ticket, deps)).status, 'EXECUTED');
  assert.equal(calls[1].func, browserActionInPage);
  assert.deepEqual(calls[1].target, { tabId: 1, documentIds: ['document-original'] });
  assert.equal(calls[1].args[1].text, 'calculus videos');
  assert.equal((await executeTicket(ticket, deps)).reason, 'ACTION_ALREADY_CONSUMED');
  assert.equal(calls.length, 2);
});

test('TYPE rejects unknown, stale, noneditable, invented and irrelevant parameters at both boundaries', () => {
  for (const change of [{ target: 'visual_88' }, { observationId: 'obs_old' }, { text: 'invented' },
    { text: 'person@example.org' }, { selector: '#search' }, { key: 'ENTER' }]) {
    const invalid = { ...type(), ...change };
    assert.throws(() => validatePlannerResponse(invalid, context()));
    assert.equal(ticketForPlan(invalid, context(), local()), null);
  }
  const noneditable = context(); noneditable.visualElements[0].editable = false;
  assert.throws(() => validatePlannerResponse(type(), noneditable));
  assert.equal(ticketForPlan(type(), noneditable, local()), null);
  const noLocal = local(); noLocal.candidateControls = {};
  assert.equal(ticketForPlan(type(), context(), noLocal), null);
});

for (const field of [{ type: 'password' }, { type: 'email' }, { name: 'fullname' },
  { label: 'Employee ID' }, { autocomplete: 'current-password' }, { type: 'tel' }]) {
  test(`TYPE rechecks sensitive signals before mutation: ${Object.keys(field)[0]} ${Object.values(field)[0]}`, async () => {
    const { deps, calls } = harness({ field });
    assert.equal((await executeTicket(ticketForPlan(type(), context(), local(), 1000), deps)).reason, 'SENSITIVE_REGION');
    assert.equal(calls.length, 1);
  });
}

test('TYPE rejects expired, replaced, moved and newly readonly controls without mutation', async () => {
  const { deps, calls } = harness();
  deps.now = () => 1000 + EXECUTION_TTL_MS + 1;
  assert.equal((await executeTicket(ticketForPlan(type(), context(), local(), 1000), deps)).reason, 'STALE_OBSERVATION');
  assert.equal(calls.length, 0);
  for (const opts of [{ blocked: true }, { current: { signature: 'changed' } },
    { current: { rect: { ...rect, y: 50 } } }, { current: { editable: false } }]) {
    const h = harness(opts);
    assert.equal((await executeTicket(ticketForPlan(type(), context(), local(), 1000), h.deps)).status, 'BLOCKED');
    assert.equal(h.calls.length, 1);
  }
});

test('ENTER is allowed only with current approved editable focus; arbitrary keys are rejected', async () => {
  const enter = plan({ action: 'PRESS_KEY', key: 'ENTER' });
  validatePlannerResponse(enter, context());
  const h = harness();
  assert.equal((await executeTicket(ticketForPlan(enter, context(), local(), 1000), h.deps)).status, 'EXECUTED');
  for (const key of ['TAB', 'CTRL+L', 'F12', 'Enter', ['ENTER'], 'ENTER;ENTER']) {
    assert.throws(() => validatePlannerResponse({ ...enter, key }, context()));
  }
  const noFocus = context(); noFocus.visualElements[0].focused = false;
  assert.throws(() => validatePlannerResponse(enter, noFocus));
  const changed = harness({ current: { focused: false } });
  assert.equal((await executeTicket(ticketForPlan(enter, context(), local(), 1000), changed.deps)).status, 'BLOCKED');
  assert.equal(changed.calls.length, 1);
});

test('SCROLL accepts enums, never arbitrary pixel distance or unrelated fields', async () => {
  const scroll = plan({ action: 'SCROLL', direction: 'DOWN', amount: 'MEDIUM' });
  validatePlannerResponse(scroll, context());
  const h = harness();
  assert.equal((await executeTicket(ticketForPlan(scroll, context(), local(), 1000), h.deps)).status, 'EXECUTED');
  for (const change of [{ amount: 500 }, { direction: 'LEFT' }, { amount: 'HUGE' }, { distance: 200 }, { target: null }]) {
    assert.throws(() => validatePlannerResponse({ ...scroll, ...change }, context()));
  }
});

test('NAVIGATE accepts normalized HTTP/S, rejects unsupported schemes and malformed URLs', () => {
  for (const [url, expected] of [['HTTPS://Example.org:443', 'https://example.org/'],
    ['http://127.0.0.1:8137/search', 'http://127.0.0.1:8137/search']]) {
    assert.equal(validatePlannerResponse(plan({ action: 'NAVIGATE', url }), context()).url, expected);
  }
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'chrome://settings', 'chrome-extension://x/a',
    'file:///x', 'about:blank', 'example.org', 'https://', 'https://example.org:bad',
    'https://user:pass@example.org/', 'https://exa mple.org', 'https://example.org/%0a']) {
    assert.throws(() => validatePlannerResponse(plan({ action: 'NAVIGATE', url }), context()));
  }
});

test('NAVIGATE requires original document, permission and active tab before update', async () => {
  const nav = plan({ action: 'NAVIGATE', url: 'https://example.net/' });
  for (const mode of ['ok', 'permission', 'document', 'cancel', 'tab']) {
    const h = harness({ blocked: mode === 'document', cancelled: mode === 'cancel' });
    if (mode === 'permission') h.deps.canNavigate = async () => false;
    if (mode === 'tab') h.deps.queryActiveTab = async () => ({ id: 4, windowId: 2 });
    const ticket = ticketForPlan(nav, context(), local(), 1000);
    const result = await executeTicket(ticket, h.deps);
    assert.equal(result.status, mode === 'ok' ? 'EXECUTED' : 'BLOCKED');
    assert.equal(h.calls.filter(c => c.navigation).length, mode === 'ok' ? 1 : 0);
    if (mode === 'ok') assert.equal((await executeTicket(ticket, h.deps)).reason, 'ACTION_ALREADY_CONSUMED');
  }
});

function event() {
  const listeners = new Set();
  return { addListener: f => listeners.add(f), removeListener: f => listeners.delete(f),
    emit: (...args) => listeners.forEach(f => f(...args)), get size() { return listeners.size; } };
}

test('navigation waits for tab completion and removes listeners; timeout/closed tab fail closed', async () => {
  for (const ending of ['complete', 'closed', 'timeout']) {
    const tabs = { onUpdated: event(), onRemoved: event(),
      update: async () => {}, get: async () => ({ status: 'loading' }) };
    let settled = false;
    const operation = navigateTab(tabs, 1, 'https://example.net/', () => false, 30);
    const observed = operation.then(() => { settled = true; return 'ok'; }, () => { settled = true; return 'failed'; });
    await new Promise(r => setImmediate(r));
    tabs.onUpdated.emit(2, { status: 'complete' });
    assert.equal(settled, false);
    if (ending === 'complete') tabs.onUpdated.emit(1, { status: 'complete' });
    if (ending === 'closed') tabs.onRemoved.emit(1);
    assert.equal(await observed, ending === 'complete' ? 'ok' : 'failed');
    assert.equal(tabs.onUpdated.size + tabs.onRemoved.size, 0);
  }
});

test('each new action settles then reobserves and plans fresh; STOP ends the existing loop', async () => {
  const actions = ['NAVIGATE', 'TYPE', 'PRESS_KEY', 'SCROLL', 'STOP'];
  const calls = [], events = [];
  let index = 0;
  const result = await runAgent('task', {
    observePlan: async () => {
      const action = actions[index++], observationId = 'obs_' + index;
      calls.push('observe ' + action);
      // STOP carries the achieved-goal reason so the sequence completes; any
      // other reason would (correctly) end the run as STOPPED instead.
      const reason = action === 'STOP' ? 'The goal is already achieved.' : 'A suitable visual target is visible.';
      return { observeStatus: 'READY', observationId, planner: { status: 'READY', plan: { action, reason } },
        ticket: { observationId, action }, signature: String(index) };
    }, execute: async ticket => { calls.push('execute ' + ticket.action); return { status: 'EXECUTED' }; },
    settle: async () => { calls.push('settle'); }, emit: e => events.push(e),
  });
  assert.equal(result.state, 'COMPLETED');
  assert.deepEqual(result.timings.map(t => t.action), actions);
  assert.deepEqual(calls, actions.flatMap(a => a === 'STOP' ? ['observe STOP'] : ['observe ' + a, 'execute ' + a, 'settle']));
  assert.deepEqual(events.filter(e => e.event === 'REOBSERVATION_READY').map(e => e.observationId), ['obs_2', 'obs_3', 'obs_4', 'obs_5']);
});

test('new actions retain MAX_STEPS, cancellation and privacy failure guards', async () => {
  for (const mode of ['limit', 'cancel', 'privacy']) {
    let count = 0, stopped = false;
    const result = await runAgent('task', { maxSteps: 3, cancelled: () => stopped,
      observePlan: async () => mode === 'privacy' ? { observeStatus: 'FAILED', observeReason: 'PRIVACY_FAILED' } :
        { observeStatus: 'READY', planner: { status: 'READY', plan: { action: 'SCROLL' } }, ticket: {}, signature: String(count) },
      execute: async () => { count++; if (mode === 'cancel') stopped = true; return { status: 'EXECUTED' }; },
    });
    assert.equal(result.reason, { limit: 'MAX_STEPS', cancel: 'CANCELLED', privacy: 'PRIVACY_FAILED' }[mode]);
    assert.equal(count, { limit: 3, cancel: 1, privacy: 0 }[mode]);
  }
});

function domHarness() {
  const originals = new Map(['window', 'document', 'HTMLInputElement', 'HTMLTextAreaElement',
    'HTMLFormElement', 'InputEvent', 'KeyboardEvent', '__edgeSightControls'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const events = [], scrolls = [];
  let submissions = 0;
  class Input {
    constructor() { this.tagName = 'INPUT'; this.isConnected = true; this.disabled = false; this.readOnly = false; this.type = 'search'; this._value = ''; }
    set value(value) { this._value = value; }
    get value() { return this._value; }
    getAttribute(key) { return key === 'type' ? this.type : null; }
    getBoundingClientRect() { return { left: 20, top: 30, width: 100, height: 40 }; }
    contains() { return false; }
    focus() { globalThis.document.activeElement = this; }
    dispatchEvent(e) { events.push(e); return !(this.preventInput && e.type === 'beforeinput') && !(this.preventEnter && e.type === 'keydown'); }
  }
  class Form { requestSubmit() { submissions++; } }
  class BrowserEvent { constructor(type, options) { Object.assign(this, { type, ...options }); } }
  const el = new Input(); el.form = new Form(); el.form.action = 'https://example.org/search';
  Object.assign(globalThis, { HTMLInputElement: Input, HTMLTextAreaElement: class extends Input {}, HTMLFormElement: Form,
    InputEvent: BrowserEvent, KeyboardEvent: BrowserEvent,
    document: { activeElement: null, elementFromPoint: () => el, URL: 'https://example.org/', baseURI: 'https://example.org/' },
    window: { innerWidth: 800, innerHeight: 600, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      scrollBy: options => scrolls.push(options) },
    __edgeSightControls: { elements: new Map([['control_2', el]]), inspect: () => 'structure' },
  });
  const bound = { ...control, signature: JSON.stringify('structure') };
  return { el, events, scrolls, bound, get submissions() { return submissions; },
    run: (action, params) => browserActionInPage(action, params, bound, { width: 800, height: 600 }),
    restore() { for (const [k, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, k, descriptor) : delete globalThis[k]; } };
}

test('actual TYPE uses the native value setter, focus and input events; cancelled input never mutates', () => {
  const dom = domHarness();
  try {
    assert.equal(dom.run('TYPE', { text: 'calculus videos' }).status, 'EXECUTED');
    assert.equal(dom.el.value, 'calculus videos');
    assert.equal(document.activeElement, dom.el);
    assert.deepEqual(dom.events.map(e => e.type), ['beforeinput', 'input', 'change']);
    dom.el.preventInput = true;
    assert.equal(dom.run('TYPE', { text: 'replacement' }).reason, 'INPUT_CANCELLED');
    assert.equal(dom.el.value, 'calculus videos');
  } finally { dom.restore(); }
});

test('actual TYPE refuses password, noneditable, covered and stale controls', () => {
  for (const mode of ['password', 'readonly', 'covered', 'stale']) {
    const dom = domHarness();
    try {
      if (mode === 'password') dom.el.type = 'password';
      if (mode === 'readonly') dom.el.readOnly = true;
      if (mode === 'covered') document.elementFromPoint = () => ({});
      if (mode === 'stale') globalThis.__edgeSightControls.inspect = () => 'changed';
      assert.equal(dom.run('TYPE', { text: 'calculus videos' }).status, 'BLOCKED');
      assert.equal(dom.el.value, '');
      assert.equal(dom.events.length, 0);
    } finally { dom.restore(); }
  }
});

test('actual ENTER dispatches the allowlisted key and submits only when uncancelled', () => {
  const dom = domHarness();
  try {
    assert.equal(dom.run('PRESS_KEY', { key: 'ENTER' }).status, 'BLOCKED');
    dom.el.focus();
    assert.equal(dom.run('PRESS_KEY', { key: 'ENTER' }).status, 'EXECUTED');
    assert.equal(dom.submissions, 1);
    assert.deepEqual(dom.events.map(e => e.type), ['keydown', 'keyup']);
    dom.el.preventEnter = true;
    dom.run('PRESS_KEY', { key: 'ENTER' });
    assert.equal(dom.submissions, 1);
    assert.equal(dom.run('PRESS_KEY', { key: 'CTRL+L' }).status, 'BLOCKED');
  } finally { dom.restore(); }
});

test('actual SCROLL derives bounded distances locally for all enum combinations', () => {
  const dom = domHarness();
  try {
    for (const direction of ['UP', 'DOWN']) for (const amount of ['SMALL', 'MEDIUM', 'LARGE']) {
      assert.equal(dom.run('SCROLL', { direction, amount }).status, 'EXECUTED');
      const { top, behavior } = dom.scrolls.at(-1);
      assert.ok(Math.abs(top) > 0 && Math.abs(top) <= 900);
      assert.equal(top > 0, direction === 'DOWN'); assert.equal(behavior, 'instant');
    }
    assert.equal(dom.run('SCROLL', { direction: 'DOWN', amount: 9000 }).status, 'BLOCKED');
    assert.equal(dom.scrolls.length, 6);
  } finally { dom.restore(); }
});

test('TYPE rechecks structure after focus and beforeinput handlers before setting a value', () => {
  for (const stage of ['focus', 'beforeinput']) {
    const dom = domHarness();
    try {
      const change = () => { globalThis.__edgeSightControls.inspect = () => 'changed-to-sensitive'; };
      if (stage === 'focus') dom.el.focus = () => { document.activeElement = dom.el; change(); };
      else dom.el.dispatchEvent = event => { if (event.type === 'beforeinput') change(); return true; };
      assert.equal(dom.run('TYPE', { text: 'calculus videos' }).status, 'BLOCKED');
      assert.equal(dom.el.value, '');
    } finally { dom.restore(); }
  }
});

test('navigation rechecks TTL and exact document after asynchronous permission lookup', async () => {
  for (const mode of ['expired', 'document-replaced']) {
    const h = harness();
    const ticket = ticketForPlan(plan({ action: 'NAVIGATE', url: 'https://example.net/' }), context(), local(), 1000);
    const dispatch = h.deps.executeScript;
    h.deps.canNavigate = async () => {
      if (mode === 'expired') h.deps.now = () => 1000 + EXECUTION_TTL_MS + 1;
      else h.deps.executeScript = async options => {
        if (options.func.name === 'documentBindingInPage') throw new Error('old document gone');
        return dispatch(options);
      };
      return true;
    };
    assert.equal((await executeTicket(ticket, h.deps)).reason, mode === 'expired' ? 'STALE_OBSERVATION' : 'PAGE_CHANGED');
    assert.equal(h.calls.filter(c => c.navigation).length, 0);
  }
});

test('cancelling a pending tab load cleans up and prevents the next observation', async () => {
  let cancelled = false;
  const tabs = { onUpdated: event(), onRemoved: event(), update: async () => { cancelled = true; },
    get: async () => ({ status: 'loading' }) };
  const operation = navigateTab(tabs, 1, 'https://example.net/', () => cancelled, 1000);
  await assert.rejects(operation);
  assert.equal(tabs.onUpdated.size + tabs.onRemoved.size, 0);
  let observations = 0; cancelled = false;
  const result = await runAgent('task', { cancelled: () => cancelled,
    observePlan: async () => { observations++; return { observeStatus: 'READY', planner: { status: 'READY', plan: { action: 'NAVIGATE' } }, ticket: {} }; },
    execute: async () => { cancelled = true; return { status: 'BLOCKED', reason: 'CANCELLED' }; },
  });
  assert.equal(result.state, 'CANCELLED'); assert.equal(observations, 1);
});

test('actual observer supplies stable local control identities and editable roles without reading values', () => {
  const names = ['window', 'document', 'getComputedStyle', '__edgeSightFields', '__edgeSightControls'];
  const saved = new Map(names.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const element = (tag, type) => ({ tagName: tag, type, name: '', id: '',
    get value() { throw new Error('must never read a local value'); },
    getAttribute: key => key === 'type' ? type : null, closest: () => null,
    getBoundingClientRect: () => ({ left: 20, top: 30, right: 120, bottom: 70, width: 100, height: 40 }),
  });
  const search = element('INPUT', 'search'), password = element('INPUT', 'password');
  const textarea = element('TEXTAREA', null), button = element('BUTTON', null);
  try {
    delete globalThis.__edgeSightFields; delete globalThis.__edgeSightControls;
    globalThis.window = { innerWidth: 800, innerHeight: 600, scrollX: 0, scrollY: 0 };
    globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
    globalThis.document = { title: 'Test', activeElement: search,
      querySelectorAll: selector => selector === 'input, select, textarea' ? [search, password, textarea] :
        selector.startsWith('button,') ? [button] : [] };
    const first = observePage();
    assert.deepEqual(first.controls.filter(c => c.editable).map(c => c.role), ['searchbox', 'textarea']);
    assert.equal(first.controls.find(c => c.fieldId === first.fieldSignals[1].id).supported, false);
    assert.equal(first.controls.find(c => c.role === 'searchbox').focused, true);
    assert.ok(first.controls.every(c => !Object.hasOwn(c, 'value')));
    globalThis.__edgeSightFields.elements.clear();
    const second = observePage();
    assert.deepEqual(second.controls, first.controls);
  } finally {
    for (const [k, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, k, descriptor) : delete globalThis[k];
  }
});
