// Phase 7 — safe visually grounded execution. No real browser: geometry is pure,
// policy uses mocked chrome deps, and clickInPage runs against a tiny DOM stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toViewportPoint, overlapsSensitive } from '../src/actions/geometry.js';
import { createTicket, ticketForPlan, executeTicket, clickInPage, EXECUTION_TTL_MS }
  from '../src/actions/execute-click.js';

// ---------- geometry: screenshot pixels -> CSS viewport point ----------

test('1:1 screenshot/viewport maps bbox center directly', () => {
  const p = toViewportPoint({ x: 0, y: 0, width: 10, height: 10 }, { width: 100, height: 100 }, { width: 100, height: 100 });
  assert.deepEqual(p, { ok: true, x: 5, y: 5 });
});

test('2x pixel density halves the coordinates', () => {
  const p = toViewportPoint({ x: 20, y: 20, width: 20, height: 20 }, { width: 200, height: 200 }, { width: 100, height: 100 });
  assert.deepEqual(p, { ok: true, x: 15, y: 15 });
});

test('non-uniform X/Y scaling applies per axis', () => {
  // center (100,50) in a 200x100 screenshot -> (50,50) in a 100x100 viewport
  const p = toViewportPoint({ x: 90, y: 40, width: 20, height: 20 }, { width: 200, height: 100 }, { width: 100, height: 100 });
  assert.deepEqual(p, { ok: true, x: 50, y: 50 });
});

test('fractional coordinates are preserved', () => {
  const p = toViewportPoint({ x: 0, y: 0, width: 3, height: 3 }, { width: 100, height: 100 }, { width: 100, height: 100 });
  assert.deepEqual(p, { ok: true, x: 1.5, y: 1.5 });
});

test('edge center clamps just inside the viewport', () => {
  const p = toViewportPoint({ x: 95, y: 0, width: 10, height: 10 }, { width: 100, height: 100 }, { width: 100, height: 100 });
  assert.equal(p.ok, true);
  assert.equal(p.x, 99.5);
});

test('invalid screenshot/viewport dimensions are rejected', () => {
  const bbox = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(toViewportPoint(bbox, { width: 0, height: 100 }, { width: 100, height: 100 }).reason, 'INVALID_GEOMETRY');
  assert.equal(toViewportPoint(bbox, { width: 100, height: 100 }, { width: 100, height: 0 }).reason, 'INVALID_GEOMETRY');
  assert.equal(toViewportPoint(bbox, { width: NaN, height: 100 }, { width: 100, height: 100 }).reason, 'INVALID_GEOMETRY');
});

test('negative and zero-size bbox are rejected', () => {
  const ss = { width: 100, height: 100 }, vp = { width: 100, height: 100 };
  assert.equal(toViewportPoint({ x: 0, y: 0, width: -5, height: 10 }, ss, vp).reason, 'INVALID_GEOMETRY');
  assert.equal(toViewportPoint({ x: 0, y: 0, width: 0, height: 10 }, ss, vp).reason, 'INVALID_GEOMETRY');
});

test('a target center outside the viewport is rejected', () => {
  const p = toViewportPoint({ x: 200, y: 0, width: 10, height: 10 }, { width: 100, height: 100 }, { width: 100, height: 100 });
  assert.equal(p.reason, 'OUT_OF_VIEWPORT');
});

test('overlapsSensitive: substantial overlap true, disjoint false, zero-size unsafe', () => {
  const bbox = { x: 10, y: 10, width: 20, height: 10 };
  assert.equal(overlapsSensitive(bbox, [{ x: 0, y: 0, width: 200, height: 100 }]), true);
  assert.equal(overlapsSensitive(bbox, [{ x: 500, y: 500, width: 10, height: 10 }]), false);
  assert.equal(overlapsSensitive({ x: 0, y: 0, width: 100, height: 100 }, [{ x: 0, y: 0, width: 10, height: 10 }]), false); // 1% < 25%
  assert.equal(overlapsSensitive({ x: 0, y: 0, width: 0, height: 0 }, []), true);
});

// ---------- ticketForPlan: observation + target binding ----------

const CONTEXT = {
  observation: { id: 'obs_1', image: { width: 200, height: 100 }, viewport: { width: 200, height: 100 } },
  visualElements: [{ id: 'visual_3', text: 'Continue', bbox: { x: 10, y: 10, width: 20, height: 10 } }],
};
const LOCAL = { tabId: 5, windowId: 2, documentId: 'doc1', url: 'http://x/', sensitiveRegions: [] };

test('valid CLICK plan produces a bound ticket', () => {
  const t = ticketForPlan({ action: 'CLICK', observationId: 'obs_1', target: 'visual_3' }, CONTEXT, LOCAL, 1000);
  assert.equal(t.observationId, 'obs_1');
  assert.equal(t.targetVisualId, 'visual_3');
  assert.deepEqual(t.bbox, { x: 10, y: 10, width: 20, height: 10 });
  assert.deepEqual(t.screenshot, { width: 200, height: 100 });
  assert.equal(t.tabId, 5);
  assert.equal(t.consumed, false);
});

test('STOP produces no ticket', () => {
  assert.equal(ticketForPlan({ action: 'STOP', observationId: 'obs_1', target: null }, CONTEXT, LOCAL), null);
});

test('planner observation mismatch produces no ticket', () => {
  assert.equal(ticketForPlan({ action: 'CLICK', observationId: 'obs_other', target: 'visual_3' }, CONTEXT, LOCAL), null);
});

test('unknown / other-observation target produces no ticket', () => {
  assert.equal(ticketForPlan({ action: 'CLICK', observationId: 'obs_1', target: 'visual_99' }, CONTEXT, LOCAL), null);
});

test('CLICK with missing target produces no ticket', () => {
  assert.equal(ticketForPlan({ action: 'CLICK', observationId: 'obs_1', target: undefined }, CONTEXT, LOCAL), null);
});

// ---------- executeTicket: tab/page/stale/geometry/replay policy ----------

function validTicket(over = {}) {
  return createTicket({
    observationId: 'obs_1', tabId: 5, windowId: 2, documentId: 'doc1', url: 'http://x/',
    targetVisualId: 'visual_3', bbox: { x: 10, y: 10, width: 20, height: 10 }, targetText: 'Continue',
    screenshot: { width: 200, height: 100 }, viewport: { width: 200, height: 100 },
    sensitiveRegions: [], now: 1000, ...over,
  });
}

function makeDeps({ activeTab = { id: 5, windowId: 2 }, tab = { id: 5, url: 'http://x/' },
  script = [{ result: { status: 'EXECUTED' } }], throwGet = false, throwScript = false, now = () => 1000 } = {}) {
  const calls = { executeScript: 0, opts: null };
  return {
    calls,
    d: {
      queryActiveTab: async () => activeTab,
      getTab: async () => { if (throwGet) throw new Error('gone'); return tab; },
      executeScript: async (opts) => { calls.executeScript++; calls.opts = opts; if (throwScript) throw new Error('doc gone'); return script; },
      now,
    },
  };
}

test('valid ticket dispatches exactly one click at the pinned document', async () => {
  const { d, calls } = makeDeps();
  const r = await executeTicket(validTicket(), d);
  assert.deepEqual(r, { status: 'EXECUTED', action: 'CLICK', observationId: 'obs_1', target: 'visual_3' });
  assert.equal(calls.executeScript, 1);
  assert.deepEqual(calls.opts.target.documentIds, ['doc1']);
});

test('null / consumed ticket blocks and never dispatches', async () => {
  const a = makeDeps();
  assert.equal((await executeTicket(null, a.d)).reason, 'ACTION_ALREADY_CONSUMED');
  assert.equal(a.calls.executeScript, 0);
  const b = makeDeps();
  const spent = validTicket();
  spent.consumed = true;
  assert.equal((await executeTicket(spent, b.d)).reason, 'ACTION_ALREADY_CONSUMED');
  assert.equal(b.calls.executeScript, 0);
});

test('replay is blocked: the same ticket executes once', async () => {
  const ticket = validTicket();
  const first = makeDeps();
  assert.equal((await executeTicket(ticket, first.d)).status, 'EXECUTED');
  const second = makeDeps();
  assert.equal((await executeTicket(ticket, second.d)).reason, 'ACTION_ALREADY_CONSUMED');
  assert.equal(second.calls.executeScript, 0);
});

test('stale observation blocks before dispatch', async () => {
  const { d, calls } = makeDeps({ now: () => 1000 + EXECUTION_TTL_MS + 1 });
  assert.equal((await executeTicket(validTicket(), d)).reason, 'STALE_OBSERVATION');
  assert.equal(calls.executeScript, 0);
});

test('missing tab, wrong active tab, and navigation all fail closed', async () => {
  let a = makeDeps({ throwGet: true });
  assert.equal((await executeTicket(validTicket(), a.d)).reason, 'TAB_CHANGED');
  assert.equal(a.calls.executeScript, 0);
  a = makeDeps({ activeTab: { id: 9, windowId: 2 } });
  assert.equal((await executeTicket(validTicket(), a.d)).reason, 'TAB_CHANGED');
  assert.equal(a.calls.executeScript, 0);
  a = makeDeps({ tab: { id: 5, url: 'http://y/' } });
  assert.equal((await executeTicket(validTicket(), a.d)).reason, 'PAGE_CHANGED');
  assert.equal(a.calls.executeScript, 0);
});

test('invalid geometry and sensitive overlap block before dispatch', async () => {
  let a = makeDeps();
  assert.equal((await executeTicket(validTicket({ bbox: { x: 0, y: 0, width: 0, height: 10 } }), a.d)).reason, 'INVALID_GEOMETRY');
  assert.equal(a.calls.executeScript, 0);
  a = makeDeps();
  assert.equal((await executeTicket(validTicket({ sensitiveRegions: [{ x: 0, y: 0, width: 200, height: 100 }] }), a.d)).reason, 'SENSITIVE_REGION');
  assert.equal(a.calls.executeScript, 0);
});

test('a navigated-away document (executeScript throws) is PAGE_CHANGED', async () => {
  const { d } = makeDeps({ throwScript: true });
  assert.equal((await executeTicket(validTicket(), d)).reason, 'PAGE_CHANGED');
});

test('an injected block reason is surfaced without repair', async () => {
  const { d } = makeDeps({ script: [{ result: { status: 'BLOCKED', reason: 'NO_ELEMENT_AT_POINT' } }] });
  assert.equal((await executeTicket(validTicket(), d)).reason, 'NO_ELEMENT_AT_POINT');
});

// ---------- clickInPage: element resolution + safety (DOM stub) ----------

function el(opts = {}) {
  return {
    nodeType: 1,
    tagName: opts.tag || 'DIV',
    attrs: opts.attrs || {},
    parentElement: opts.parent || null,
    isConnected: opts.isConnected !== false,
    disabled: opts.disabled || false,
    rect: opts.rect || { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 },
    style: opts.style || { display: 'block', visibility: 'visible', opacity: '1' },
    text: opts.text ?? '',
    value: opts.value ?? '',
    clicked: 0,
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
    getBoundingClientRect() { return this.rect; },
    get innerText() { return this.text; },
    get textContent() { return this.text; },
    contains(other) { for (let n = other; n; n = n.parentElement) if (n === this) return true; return false; },
    click() { this.clicked++; },
  };
}

function withDom({ hit, innerWidth = 1000, innerHeight = 800 }, fn) {
  globalThis.window = { innerWidth, innerHeight, getComputedStyle: (n) => n.style };
  globalThis.document = { elementFromPoint: () => hit };
  try { return fn(); } finally { delete globalThis.window; delete globalThis.document; }
}

const VP = { width: 1000, height: 800 };

test('a button at the point is clicked once', () => {
  const btn = el({ tag: 'BUTTON', text: 'Continue' });
  const r = withDom({ hit: btn }, () => clickInPage(50, 20, VP, 'Continue'));
  assert.equal(r.status, 'EXECUTED');
  assert.equal(btn.clicked, 1);
});

test('a span inside a button resolves up to the button', () => {
  const btn = el({ tag: 'BUTTON', text: 'Continue' });
  const span = el({ tag: 'SPAN', parent: btn, text: 'Continue' });
  const r = withDom({ hit: span }, () => clickInPage(50, 20, VP, 'Continue'));
  assert.equal(r.status, 'EXECUTED');
  assert.equal(btn.clicked, 1);
});

test('submit input and role=button are accepted', () => {
  const submit = el({ tag: 'INPUT', attrs: { type: 'submit' }, value: 'Continue' });
  assert.equal(withDom({ hit: submit }, () => clickInPage(50, 20, VP, 'Continue')).status, 'EXECUTED');
  const roleBtn = el({ tag: 'DIV', attrs: { role: 'button' }, text: 'Continue' });
  assert.equal(withDom({ hit: roleBtn }, () => clickInPage(50, 20, VP, 'Continue')).status, 'EXECUTED');
});

test('a random div is rejected as unsafe', () => {
  const div = el({ tag: 'DIV', text: 'Continue' });
  const r = withDom({ hit: div }, () => clickInPage(50, 20, VP, 'Continue'));
  assert.equal(r.reason, 'UNSAFE_ELEMENT');
  assert.equal(div.clicked, 0);
});

test('disabled and aria-disabled buttons are rejected', () => {
  const disabled = el({ tag: 'BUTTON', text: 'Continue', disabled: true });
  assert.equal(withDom({ hit: disabled }, () => clickInPage(50, 20, VP, 'Continue')).reason, 'DISABLED_ELEMENT');
  const aria = el({ tag: 'BUTTON', text: 'Continue', attrs: { 'aria-disabled': 'true' } });
  assert.equal(withDom({ hit: aria }, () => clickInPage(50, 20, VP, 'Continue')).reason, 'DISABLED_ELEMENT');
});

test('hidden and zero-size buttons are rejected', () => {
  const hidden = el({ tag: 'BUTTON', text: 'Continue', style: { display: 'none', visibility: 'visible', opacity: '1' } });
  assert.equal(withDom({ hit: hidden }, () => clickInPage(50, 20, VP, 'Continue')).reason, 'UNSAFE_ELEMENT');
  const zero = el({ tag: 'BUTTON', text: 'Continue', rect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } });
  assert.equal(withDom({ hit: zero }, () => clickInPage(50, 20, VP, 'Continue')).reason, 'UNSAFE_ELEMENT');
});

test('no element at the point is reported', () => {
  assert.equal(withDom({ hit: null }, () => clickInPage(50, 20, VP, 'Continue')).reason, 'NO_ELEMENT_AT_POINT');
});

test('a point outside the resolved control rect is rejected (covered/inconsistent)', () => {
  const btn = el({ tag: 'BUTTON', text: 'Continue', rect: { left: 200, top: 200, right: 300, bottom: 240, width: 100, height: 40 } });
  const r = withDom({ hit: btn }, () => clickInPage(50, 20, VP, 'Continue'));
  assert.equal(r.reason, 'UNSAFE_ELEMENT');
});

test('a materially changed viewport is PAGE_CHANGED', () => {
  const btn = el({ tag: 'BUTTON', text: 'Continue' });
  const r = withDom({ hit: btn, innerWidth: 600 }, () => clickInPage(50, 20, VP, 'Continue'));
  assert.equal(r.reason, 'PAGE_CHANGED');
  assert.equal(btn.clicked, 0);
});

test('a clear text mismatch blocks; a match clicks', () => {
  const wrong = el({ tag: 'BUTTON', text: 'Delete account' });
  assert.equal(withDom({ hit: wrong }, () => clickInPage(50, 20, VP, 'Continue')).reason, 'UNSAFE_ELEMENT');
  const right = el({ tag: 'BUTTON', text: 'Continue' });
  assert.equal(withDom({ hit: right }, () => clickInPage(50, 20, VP, 'Continue')).status, 'EXECUTED');
});
