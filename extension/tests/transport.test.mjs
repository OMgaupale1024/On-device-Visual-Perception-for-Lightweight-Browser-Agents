import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { requestPlan } from '../src/transport/planner-client.js';
import { PLANNER_CONFIG } from '../src/transport/config.js';
import { buildSafeAgentContext } from '../src/privacy/agent-context.js';
import { approvedContext, clickPlan, plannerInput, SECRETS } from './planner-fixture.mjs';

const reply = (value = clickPlan()) => ({ ok: true, json: async () => value });

test('exact POST body is only the approved SafeAgentContext; config and privacy options', async () => {
  const context = approvedContext();
  let calls = 0;
  const result = await requestPlan(context, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, PLANNER_CONFIG.url);
    assert.equal(url, 'http://127.0.0.1:8000/plan');
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store'); assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(options.body), context);
    assert.equal(options.body, JSON.stringify(context));
    for (const secret of SECRETS) assert.ok(!options.body.includes(secret));
    assert.ok(!/data:image|rawScreenshot|rawOCR|rawDOM|localPreview|dataUrl/.test(options.body));
    return reply();
  } });
  assert.equal(calls, 1); assert.equal(result.status, 'READY');
  assert.equal(result.privacy, 'SAFE'); assert.deepEqual(result.plan, clickPlan());
  assert.equal(result.bytes, Buffer.byteLength(JSON.stringify(context)));
});

for (const [index, secret] of SECRETS.entries()) {
  for (const location of ['goal', 'field', 'visual', 'nested metadata']) {
    test(`contamination canary ${index + 1} at ${location}: privacy block, fetch count zero`, async () => {
      const context = structuredClone(approvedContext());
      if (location === 'goal') context.goal = secret;
      if (location === 'field') context.fields[5].value = secret;
      if (location === 'visual') context.visualElements[0].text = secret;
      if (location === 'nested metadata') context.observation.metadata = { deep: { note: secret } };
      let calls = 0;
      const result = await requestPlan(context, { fetchImpl: async () => { calls++; return reply(); } });
      assert.equal(result.status, 'BLOCKED'); assert.equal(result.privacy, 'BLOCKED');
      assert.equal(calls, 0); assert.equal(result.bytes, 0);
      assert.ok(!JSON.stringify(result).includes(secret));
    });
  }
}

test('upstream final known-value gate blocks before transport, including non-demo secrets', async () => {
  for (const secret of [...SECRETS, 'another-private-value']) {
    const input = plannerInput(); input.sensitiveValues = [...SECRETS, secret]; input.goal = secret;
    const agent = buildSafeAgentContext(input);
    assert.equal(agent.status, 'BLOCKED');
    let calls = 0;
    const result = await requestPlan(agent.context, { fetchImpl: async () => { calls++; return reply(); } });
    assert.equal(result.status, 'BLOCKED'); assert.equal(calls, 0);
  }
});

test('no cast interface: clean clones, local envelopes, proxies, raw images and accessors rejected', async () => {
  const ctx = approvedContext();
  for (const candidate of [structuredClone(ctx), { agentContext: ctx }, new Proxy(ctx, {}),
    'data:image/png;base64,AAAA', null, { get goal() { throw new Error('must not read'); } }]) {
    let calls = 0;
    assert.equal((await requestPlan(candidate, { fetchImpl: async () => { calls++; } })).status, 'BLOCKED');
    assert.equal(calls, 0);
  }
  assert.throws(() => { ctx.goal = SECRETS[0]; }, TypeError);
  assert.throws(() => { ctx.visualElements[0].text = SECRETS[0]; }, TypeError);
});

for (const [name, mutate] of [
  ['schema mismatch', (v) => { v.schemaVersion = 2; }],
  ['invalid action', (v) => { v.action = 'TYPE'; }],
  ['unknown target', (v) => { v.target = 'visual_999'; }],
  ['missing target', (v) => { delete v.target; }],
  ['stale observation', (v) => { v.observationId = 'obs_old'; }],
  ['missing observation', (v) => { delete v.observationId; }],
  ['selector', (v) => { v.selector = '#continue'; }],
  ['coordinates', (v) => { v.x = 10; v.y = 20; }],
  ['invalid reason', (v) => { v.reason = {}; }],
  ['STOP with target', (v) => { v.action = 'STOP'; }],
]) test(`response rejected: ${name}`, async () => {
  const plan = clickPlan(); mutate(plan);
  const result = await requestPlan(approvedContext(), { fetchImpl: async () => reply(plan) });
  assert.equal(result.status, 'REJECTED'); assert.ok(!result.plan);
});

test('STOP with null target accepted', async () => {
  const plan = { ...clickPlan(), action: 'STOP', target: null };
  assert.equal((await requestPlan(approvedContext(), { fetchImpl: async () => reply(plan) })).plan.action, 'STOP');
});

test('network exception is generic and local context remains available', async () => {
  const ctx = approvedContext();
  const result = await requestPlan(ctx, { fetchImpl: async () => { throw new Error(SECRETS[0]); } });
  assert.equal(result.status, 'UNAVAILABLE'); assert.ok(!JSON.stringify(result).includes(SECRETS[0]));
  assert.equal(ctx.privacy.status, 'safe');
});

for (const status of [400, 403, 422, 500]) test(`HTTP ${status} handled without reading error payload`, async () => {
  const result = await requestPlan(approvedContext(), { fetchImpl: async () => ({ ok: false, status,
    json() { assert.fail('must not read rejected body'); } }) });
  assert.equal(result.status, status >= 500 ? 'UNAVAILABLE' : 'REJECTED');
});

test('invalid server JSON rejected', async () => {
  assert.equal((await requestPlan(approvedContext(), { fetchImpl: async () => ({ ok: true,
    json: async () => { throw new SyntaxError('bad JSON'); } }) })).status, 'REJECTED');
});

for (const stage of ['fetch', 'body']) test(`timeout bounds ${stage} and aborts signal`, async () => {
  let signal;
  const result = await requestPlan(approvedContext(), { timeoutMs: 10, fetchImpl: async (_url, options) => {
    signal = options.signal;
    if (stage === 'fetch') return new Promise(() => {});
    return { ok: true, json: () => new Promise(() => {}) };
  } });
  assert.equal(result.status, 'UNAVAILABLE'); assert.match(result.reason, /timeout/);
  assert.equal(signal.aborted, true);
});

test('transport imports only privacy approval and endpoint config, never raw modules', async () => {
  const source = await readFile(new URL('../src/transport/planner-client.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports, ['../privacy/agent-context.js', './config.js']);
  assert.ok(!/chrome\.|rawScreenshot|rawOCR|dataUrl|localPreview|redact\.js|sensitiveValues/.test(source));
  const popup = await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8');
  assert.ok(!/fetch|requestPlan/.test(popup));
});

test('server fixture matches the actual Phase 5 builder wire contract', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../server/tests/safe-context.json', import.meta.url), 'utf8'));
  assert.deepEqual(fixture, approvedContext());
});

for (const mode of ['ai', 'deterministic', 'unknown-provider', null]) {
  test(`planner mode header is explicit and allowlisted: ${mode}`, async () => {
    const result = await requestPlan(approvedContext(), { fetchImpl: async () => ({
      ...reply(), headers: { get: () => mode },
    }) });
    assert.equal(result.plannerMode, ['ai', 'deterministic'].includes(mode) ? mode : 'unknown');
    assert.deepEqual(result.plan, clickPlan()); // Wire contract remains unchanged.
  });
}

test('AI failure remains visibly AI and never invents a fallback decision', async () => {
  const result = await requestPlan(approvedContext(), { fetchImpl: async () => ({
    ok: false, status: 503, headers: { get: () => 'ai' },
  }) });
  assert.equal(result.status, 'UNAVAILABLE'); assert.equal(result.plannerMode, 'ai');
  assert.equal(result.plan, undefined); assert.equal(PLANNER_CONFIG.timeoutMs, 20_000);
});
