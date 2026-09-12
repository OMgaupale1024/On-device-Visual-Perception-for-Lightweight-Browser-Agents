import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runSmoke } from '../../scripts/smoke-planner.mjs';
import { requestPlan } from '../src/transport/planner-client.js';
import { approvedContext } from './planner-fixture.mjs';

const response = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'X-EdgeSight-Planner': 'ai', ...extra },
});
const valid = (options, action) => response({ schemaVersion: 1,
  observationId: JSON.parse(options.body).observation.id, action,
  target: action === 'CLICK' ? 'visual_12' : null, reason: 'A suitable visual target is visible.' });

test('smoke still requires both genuine response decisions and checks observation binding', async () => {
  let calls = 0;
  const output = [];
  assert.equal(await runSmoke({ ai: true, write: line => output.push(line), fetchImpl: async (url, options) => {
    if (url.endsWith('/health')) return response({ status: 'ok' });
    return valid(options, calls++ === 0 ? 'CLICK' : 'STOP');
  } }), true);
  assert.equal(calls, 2);
  assert.match(output.at(-1), /^PASS ai localhost HTTP: health, CLICK, STOP, observation binding/);
});

test('STOP-stage 504 is named accurately, returns failure and never retries or reads the error body', async () => {
  const output = [];
  let calls = 0, cancelled = 0;
  const passed = await runSmoke({ ai: true, write: line => output.push(line), fetchImpl: async (url, options) => {
    if (url.endsWith('/health')) return response({ status: 'ok' });
    if (calls++ === 0) return valid(options, 'CLICK');
    return { ok: false, status: 504, headers: new Headers({ 'X-EdgeSight-Planner': 'ai' }),
      body: { cancel: async () => { cancelled++; } }, json: () => assert.fail('private body must not be read') };
  } });
  assert.equal(passed, false); assert.equal(calls, 2); assert.equal(cancelled, 1);
  assert.match(output.at(-1), /"stage":"STOP","code":"PROVIDER_TIMEOUT"/);
  assert.match(output.at(-1), /"httpStatus":504/);
});

test('NVIDIA 500 status is retained numerically while untrusted headers and bodies never print', async () => {
  for (const upstream of ['500', 'private-header-canary']) {
    const result = await requestPlan(approvedContext(), { fetchImpl: async () =>
      response({ detail: 'private-body-canary' }, 503, { 'X-EdgeSight-Planner-Upstream-Status': upstream }) });
    assert.equal(result.status, 'UNAVAILABLE'); assert.equal(result.httpStatus, 503);
    assert.equal(result.upstreamStatus, upstream === '500' ? 500 : null);
    assert.doesNotMatch(JSON.stringify(result), /private-.*canary/);
  }
});

test('only allowlisted failure codes reach smoke diagnostics', async () => {
  for (const code of ['INVALID_REASON', 'private-error-canary']) {
    const output = [];
    assert.equal(await runSmoke({ ai: true, write: line => output.push(line), fetchImpl: async url =>
      url.endsWith('/health') ? response({ status: 'ok' }) : response({}, 502, { 'X-EdgeSight-Planner-Failure': code }) }), false);
    assert.match(output[0], code === 'INVALID_REASON' ? /INVALID_REASON/ : /INVALID_PROVIDER_OUTPUT/);
    assert.doesNotMatch(output[0], /private-error-canary/);
  }
});

test('repeat mode gathers per-stage latency samples and reports a numeric summary', async () => {
  const output = [];
  const server = new Set();
  assert.equal(await runSmoke({ ai: true, repeats: 2, write: line => output.push(line), fetchImpl: async (url, options) => {
    if (url.endsWith('/health')) return response({ status: 'ok' });
    const action = JSON.parse(options.body).actionCandidates?.length ? 'CLICK' : 'STOP';
    server.add(action);
    return response({ schemaVersion: 1, observationId: JSON.parse(options.body).observation.id, action,
      target: action === 'CLICK' ? 'visual_12' : null, reason: 'A suitable visual target is visible.' },
      200, { 'Server-Timing': 'planner;dur=1234.5' });
  } }), true);
  const summary = output.find(l => l.startsWith('SUMMARY ai:'));
  assert.ok(summary, 'summary line present');
  const stats = JSON.parse(summary.slice('SUMMARY ai: '.length));
  assert.equal(stats.CLICK.n, 2); assert.equal(stats.STOP.n, 2);
  // plannerMs from Server-Timing surfaces in the per-stage diagnostics (numeric, safe).
  assert.match(output.find(l => l.startsWith('PASS CLICK')), /"plannerMs":1234.5/);
});

test('wrong model decision still fails rather than being replaced with the fixture expectation', async () => {
  const output = [];
  assert.equal(await runSmoke({ ai: true, write: line => output.push(line), fetchImpl: async (url, options) =>
    url.endsWith('/health') ? response({ status: 'ok' }) : valid(options, 'STOP') }), false);
  assert.match(output.at(-1), /WRONG_ACTION/);
});

test('health network errors and hung health bodies fail safely with a bounded deadline', async () => {
  for (const hangs of [false, true]) {
    const output = [];
    assert.equal(await runSmoke({ write: line => output.push(line), healthTimeoutMs: 10, fetchImpl: async () => {
      if (hangs) return { ok: true, json: () => new Promise(() => {}) };
      throw new Error('private-exception-canary');
    } }), false);
    assert.match(output[0], hangs ? /HEALTH_TIMEOUT/ : /SERVER_UNREACHABLE/);
    assert.doesNotMatch(output[0], /private-exception-canary/);
  }
});

test('actual CLI exits 1 cleanly on 504 without uncaught assertion or libuv abort', () => {
  const preload = `globalThis.fetch = async url => url.endsWith('/health') ?
    new Response(JSON.stringify({status:'ok'})) : new Response('private-body-canary',
      {status:504,headers:{'X-EdgeSight-Planner':'ai'}});`;
  let failed = false;
  try {
    execFileSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(preload),
      'scripts/smoke-planner.mjs', '--ai'], { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
  } catch (error) {
    failed = true;
    assert.equal(error.status, 1); assert.equal(error.signal, null);
    assert.match(error.stdout, /PROVIDER_TIMEOUT/);
    assert.doesNotMatch(error.stdout + error.stderr, /private-body-canary|AssertionError|UV_HANDLE_CLOSING/);
  }
  assert.equal(failed, true);
});
