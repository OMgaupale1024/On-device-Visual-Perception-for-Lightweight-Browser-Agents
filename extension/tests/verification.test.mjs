import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSafeAgentContext } from '../src/privacy/agent-context.js';
import { verifyVisualResult, normalizeText } from '../src/verification/verify-visual-result.js';
import { verifyAfterClick, POST_CLICK_DELAY_MS } from '../src/verification/verify-after-click.js';
import { bounded } from '../src/background/local-observation.js';

const phrase = 'Travel Request Submitted';
const binding = { actionObservationId: 'obs_old', dispatchedAt: 1000 };
const item = (text, x = 10, y = 10, width = 200) => ({ id: 'visual_1', text,
  bbox: { x, y, width, height: 20 }, confidence: 0.95 });
function approved(items, extra = {}) {
  return buildSafeAgentContext({ goal: '', semantic: { fields: [] },
    visualState: { items: items.map((v, i) => ({ ...v, id: `visual_${i + 1}` })) },
    image: { width: 1000, height: 500, redactedRegions: 0 },
    observation: { id: 'obs_new', capturedAt: new Date(2000).toISOString(), viewport: { width: 1000, height: 500 } },
    sensitiveValues: [], ...extra }).context;
}
for (const text of [phrase, 'TRAVEL REQUEST SUBMITTED', '  Travel   Request\n Submitted  ', 'Travel Request Submitted !']) {
  test(`fresh pixel phrase verifies: ${JSON.stringify(text)}`, () => {
    const result = verifyVisualResult(approved([item(text)]), binding);
    assert.equal(result.status, 'VERIFIED');
    assert.equal(result.evidence.expected, phrase);
    assert.deepEqual(result.evidence.confidences, [0.95]);
    assert.equal(result.evidence.source, 'visual');
  });
}
for (const text of ['Travel Request', 'Submitted', 'Request Submitted', 'Travel Request Pending',
  'Travel Request Failed', 'The unrelated application was submitted', 'Travel Request Submittedness',
  'Pretravel Request Submitted', 'Travel Request: Submitted']) {
  test(`full phrase policy rejects: ${text}`, () => assert.equal(
    verifyVisualResult(approved([item(text)]), binding).reason, 'NO_VISUAL_MATCH'));
}
test('normalization keeps punctuation but normalizes its spacing', () => {
  assert.equal(normalizeText('  Travel  Request Submitted  !  '), 'travel request submitted!');
});
test('shuffled split lines use bbox reading order', () => {
  const result = verifyVisualResult(approved([item('Submitted', 10, 40), item('Travel Request')]), binding);
  assert.equal(result.status, 'VERIFIED');
  assert.deepEqual(result.evidence.visualIds, ['visual_2', 'visual_1']);
});
test('shuffled horizontal fragments use left-to-right positions', () => {
  const result = verifyVisualResult(approved([item('Submitted', 180, 11, 90),
    item('Travel', 10, 10, 60), item('Request', 80, 12, 90)]), binding);
  assert.equal(result.status, 'VERIFIED');
});
for (const [label, elements] of [
  ['reverse reading order', [item('Submitted'), item('Travel Request', 10, 40)]],
  ['distant lines', [item('Travel Request'), item('Submitted', 10, 200)]],
  ['different columns', [item('Travel Request'), item('Submitted', 500, 40)]],
  ['intervening text', [item('Travel Request'), item('Pending', 10, 40), item('Submitted', 10, 70)]],
  ['empty pixels', []],
]) test(`no blind concatenation: ${label}`, () => assert.equal(verifyVisualResult(approved(elements), binding).status, 'NOT_VERIFIED'));
test('old observation identity and pre-dispatch capture cannot verify', () => {
  const ctx = approved([item(phrase)]);
  assert.equal(verifyVisualResult(ctx, { ...binding, actionObservationId: ctx.observation.id }).reason, 'STALE_OBSERVATION');
  assert.equal(verifyVisualResult(ctx, { ...binding, dispatchedAt: 2000 }).reason, 'STALE_OBSERVATION');
});
test('DOM semantic text and goal do not count as visual evidence', () => {
  const ctx = approved([], { goal: phrase, semantic: { fields: [
    { id: 'field_1', role: 'other', sensitive: false, filled: true, value: phrase },
  ] } });
  assert.equal(verifyVisualResult(ctx, binding).reason, 'NO_VISUAL_MATCH');
});
test('server/planner envelopes, raw visual lookalikes and cloned approval are rejected', () => {
  const ctx = approved([item(phrase)]);
  for (const candidate of [{ reason: phrase }, { response: phrase }, { domText: phrase },
    { visualElements: [{ ...item(phrase), source: 'semantic' }] }, structuredClone(ctx)]) {
    assert.equal(verifyVisualResult(candidate, binding).reason, 'PRIVACY_FAILED');
  }
});
test('confidence remains actual null/low values; no invented threshold', () => {
  for (const confidence of [null, 0.01]) {
    const result = verifyVisualResult(approved([{ ...item(phrase), confidence }]), binding);
    assert.equal(result.status, 'VERIFIED'); assert.deepEqual(result.evidence.confidences, [confidence]);
  }
});
test('only the narrow local spec is supported', () => {
  assert.equal(verifyVisualResult(approved([item(phrase)]), binding,
    { type: 'VISUAL_TEXT', expectedText: 'Submitted' }).reason, 'INVALID_SPEC');
});

const ticket = { observationId: 'obs_old', tabId: 1, windowId: 2, documentId: 'old', url: 'https://old.invalid/' };
function deps(overrides = {}) {
  return { delay: async (ms) => assert.equal(ms, POST_CLICK_DELAY_MS),
    getTab: async () => ({ id: 1, windowId: 2, url: 'https://new.invalid/' }),
    active: async () => {},
    observe: async (tab, goal, options) => {
      assert.equal(tab.documentId, undefined); assert.equal(goal, ''); assert.ok(options.signal);
      return { timings: { captureMs: 2, perceptionMs: 3 }, result: {
        perception: { status: 'Ready', privacy: 'SAFE' }, agentContextStatus: 'READY',
        agentContext: approved([item(phrase)]) } };
    }, ...overrides };
}
test('one local attempt accepts same tab with new URL; timing and safe metadata only', async () => {
  const result = await verifyAfterClick(ticket, 1000, deps());
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.privacy, 'SAFE');
  assert.equal(result.actionObservationId, 'obs_old'); assert.equal(result.verificationObservationId, 'obs_new');
  for (const value of Object.values(result.timing)) assert.ok(Number.isFinite(value) && value >= 0);
  assert.equal(result.timing.captureMs, 2); assert.equal(result.timing.perceptionMs, 3);
  assert.ok(!/dataUrl|rawOCR|fields|url|documentId/.test(JSON.stringify(result)));
});
for (const [label, getTab] of [
  ['missing', async () => { throw Error('private-canary'); }],
  ['absent', async () => undefined], ['wrong tab', async () => ({ id: 9, windowId: 2 })],
  ['wrong window', async () => ({ id: 1, windowId: 9 })],
]) test(`tab ${label} blocks before observing`, async () => {
  let calls = 0;
  const result = await verifyAfterClick(ticket, 1000, deps({ getTab, observe: async () => calls++ }));
  assert.equal(result.reason, 'TAB_CHANGED'); assert.equal(calls, 0);
  assert.ok(!JSON.stringify(result).includes('private-canary'));
});
test('switched tab blocks before observing', async () => {
  let calls = 0;
  const result = await verifyAfterClick(ticket, 1000, deps({ active: async () => { throw Error('TAB_CHANGED'); },
    observe: async () => calls++ }));
  assert.equal(result.reason, 'TAB_CHANGED'); assert.equal(calls, 0);
});
for (const reason of ['CAPTURE_FAILED', 'PERCEPTION_FAILED', 'PRIVACY_FAILED', 'TIMEOUT']) {
  test(`hard error ${reason}: one attempt, no retry`, async () => {
    let calls = 0;
    const result = await verifyAfterClick(ticket, 1000, deps({ observe: async () => { calls++; throw Error(reason); } }));
    assert.equal(result.status, 'NOT_VERIFIED'); assert.equal(result.reason, reason); assert.equal(calls, 1);
  });
}
test('empty/no match stops after exactly one attempt', async () => {
  let calls = 0;
  const result = await verifyAfterClick(ticket, 1000, deps({ observe: async () => {
    calls++; return { timings: {}, result: { perception: { status: 'Empty', privacy: 'SAFE' },
      agentContextStatus: 'READY', agentContext: approved([]) } };
  } }));
  assert.equal(result.reason, 'NO_VISUAL_MATCH'); assert.equal(calls, 1);
});
test('transaction deadline aborts hung work and cannot accept late evidence', async () => {
  let resolve, signal;
  const result = await verifyAfterClick(ticket, 1000, deps({ timeoutMs: 10,
    observe: (_tab, _goal, opts) => { signal = opts.signal; return new Promise((r) => { resolve = r; }); } }));
  assert.equal(result.reason, 'TIMEOUT'); assert.equal(signal.aborted, true);
  resolve(await deps().observe({}, '', { signal }));
  await new Promise((r) => setImmediate(r));
  assert.equal(result.status, 'NOT_VERIFIED');
});
test('local API timeout is bounded and abort blocks starting work', async () => {
  await assert.rejects(bounded(() => new Promise(() => {}), undefined, 5), /TIMEOUT/);
  const c = new AbortController(); c.abort(); let calls = 0;
  await assert.rejects(bounded(() => calls++, c.signal), /TIMEOUT/); assert.equal(calls, 0);
});
