// Run against a separately started local FastAPI server. Only a synthetic SAFE
// context is sent; no screenshots, page access or browser action implementation.
import assert from 'node:assert/strict';
import { requestPlan } from '../extension/src/transport/planner-client.js';
import { buildSafeAgentContext } from '../extension/src/privacy/agent-context.js';
import { approvedContext, plannerInput } from '../extension/tests/planner-fixture.mjs';

const health = await fetch('http://127.0.0.1:8000/health');
assert.deepEqual(await health.json(), { status: 'ok' });
const click = await requestPlan(approvedContext());
assert.equal(click.status, 'READY');
assert.equal(click.plan.action, 'CLICK');
assert.equal(click.plan.target, 'visual_12');
assert.equal(click.plan.observationId, 'obs_demo-abc');
const input = plannerInput(); input.visualState.items = [];
const stop = await requestPlan(buildSafeAgentContext(input).context);
assert.equal(stop.status, 'READY'); assert.equal(stop.plan.action, 'STOP');
assert.equal(stop.plan.target, null);
console.log(`PASS real localhost HTTP: health, CLICK, STOP, observation binding; approved payload ${click.bytes} bytes.`);
