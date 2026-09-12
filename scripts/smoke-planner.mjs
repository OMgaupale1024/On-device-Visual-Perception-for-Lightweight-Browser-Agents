// Run against a separately started local FastAPI server. Only a synthetic SAFE
// context is sent; no screenshots, page access or browser action implementation.
import { pathToFileURL } from 'node:url';
import { requestPlan } from '../extension/src/transport/planner-client.js';
import { buildSafeAgentContext } from '../extension/src/privacy/agent-context.js';
import { approvedContext, plannerInput } from '../extension/tests/planner-fixture.mjs';

export async function runSmoke({ ai = false, fetchImpl = globalThis.fetch, write = console.log,
  now = Date.now, healthTimeoutMs = 5000, repeats = 1 } = {}) {
  const expectedMode = ai ? 'ai' : 'deterministic';
  // Fixed codes and numeric/status metadata only; never print bodies or exceptions.
  const fail = (stage, code, diagnostics = {}) => {
    write(`FAIL ${expectedMode} localhost HTTP: ${JSON.stringify({ stage, code, ...diagnostics })}`);
    return false;
  };
  const healthController = new AbortController();
  let healthTimer;
  try {
    const health = await Promise.race([
      (async () => {
        const response = await fetchImpl('http://127.0.0.1:8000/health', { signal: healthController.signal });
        if (!response.ok) { await response.body?.cancel(); return null; }
        return response.json();
      })(),
      new Promise((_, reject) => { healthTimer = setTimeout(() => {
        healthController.abort(); reject(new Error('HEALTH_TIMEOUT'));
      }, healthTimeoutMs); }),
    ]);
    if (!health || health.status !== 'ok' || Object.keys(health).length !== 1) return fail('HEALTH', 'INVALID_HEALTH');
  } catch { return fail('HEALTH', healthController.signal.aborted ? 'HEALTH_TIMEOUT' : 'SERVER_UNREACHABLE'); }
  finally { clearTimeout(healthTimer); }

  let bytes;
  // Per-stage client round-trip samples; plannerMs (server Server-Timing) isolates real
  // provider latency from localhost overhead so repeated runs reveal deterministic-vs-variance.
  const samples = { CLICK: [], STOP: [] };
  const runAction = async (action) => {
    const input = plannerInput();
    if (action === 'STOP') input.visualState.items = [];
    const context = action === 'CLICK' ? approvedContext() : buildSafeAgentContext(input).context;
    const start = now();
    const result = await requestPlan(context, { fetchImpl });
    const elapsedMs = Math.max(0, Math.round(now() - start));
    samples[action].push(elapsedMs);
    const diagnostics = { status: result.status, planner: result.plannerMode,
      httpStatus: result.httpStatus ?? null, upstreamStatus: result.upstreamStatus ?? null,
      plannerMs: result.serverTiming?.plannerMs ?? null, elapsedMs };
    if (result.status !== 'READY') {
      const code = result.failureCode || (result.httpStatus === 504 ? 'PROVIDER_TIMEOUT' : result.httpStatus === 502 ? 'INVALID_PROVIDER_OUTPUT' :
        result.upstreamStatus ? 'UPSTREAM_HTTP_ERROR' : result.httpStatus === 503 ? 'PROVIDER_UNAVAILABLE' :
        result.reason === 'Planner unavailable: timeout.' ? 'CLIENT_TIMEOUT' : result.httpStatus ? 'PLAN_REJECTED' : 'NETWORK_ERROR');
      return fail(action, code, diagnostics);
    }
    if (result.plannerMode !== expectedMode) return fail(action, 'WRONG_PLANNER_MODE', diagnostics);
    if (result.plan.action !== action) return fail(action, 'WRONG_ACTION', { ...diagnostics, actualAction: result.plan.action });
    if (result.plan.target !== (action === 'CLICK' ? 'visual_12' : null) || result.plan.observationId !== context.observation.id) {
      return fail(action, 'INVALID_BINDING', diagnostics);
    }
    bytes ??= result.bytes;
    write(`PASS ${action} fixture: ${JSON.stringify(diagnostics)}`);
    return true;
  };

  for (let attempt = 1; attempt <= Math.max(1, repeats); attempt++) {
    for (const action of ['CLICK', 'STOP']) {
      if (!await runAction(action)) return false; // fail closed on first bad attempt; never retry silently
    }
  }
  if (repeats > 1) {
    const stat = (a) => { const s = [...a].sort((x, y) => x - y);
      return { n: s.length, minMs: s[0], medianMs: s[(s.length - 1) >> 1], maxMs: s.at(-1) }; };
    write(`SUMMARY ${expectedMode}: ${JSON.stringify({ CLICK: stat(samples.CLICK), STOP: stat(samples.STOP) })}`);
  }
  write(`PASS ${expectedMode} localhost HTTP: health, CLICK, STOP, observation binding; approved payload ${bytes} bytes.`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repeatIndex = process.argv.indexOf('--repeat');
  const repeats = repeatIndex >= 0 ? Math.max(1, Math.min(50, parseInt(process.argv[repeatIndex + 1], 10) || 1)) : 1;
  // Natural teardown avoids abrupt uncaught-assertion/process.exit shutdown on Windows.
  try { if (!await runSmoke({ ai: process.argv.includes('--ai'), repeats })) process.exitCode = 1; }
  catch { console.error('FAIL localhost HTTP: SMOKE_INTERNAL_ERROR'); process.exitCode = 1; }
}
