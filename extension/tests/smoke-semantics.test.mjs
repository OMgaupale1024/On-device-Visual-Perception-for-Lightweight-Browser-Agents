// The live semantics smoke must fail a READY-state success claim and pass real results.
// Scripted server answers stand in for the model here; the live run is the model check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, runSemantics } from '../../scripts/smoke-semantics.mjs';

const ACHIEVED = 'The goal is already achieved.';
const GOOD = {
  'form-ready-submit': { action: 'CLICK', target: 'visual_12', reason: 'Required fields are filled and Continue is visible.' },
  'generic-ready-send': { action: 'CLICK', target: 'visual_3', reason: 'A suitable visual target is visible.' },
  'result-visible': { action: 'STOP', target: null, reason: ACHIEVED },
  'search-typed-no-results': { action: 'PRESS_KEY', key: 'ENTER', reason: 'A suitable visual target is visible.' },
  'navigate-pending': { action: 'NAVIGATE', url: 'https://www.youtube.com/', reason: 'A suitable visual target is visible.' },
  'no-target-unfinished': { action: 'STOP', target: null, reason: 'No suitable visual target is available.' },
};

function fakeServer(answers) {
  let i = 0;
  return async (_url, options) => {
    const context = JSON.parse(options.body);
    const answer = answers[SCENARIOS[i++].name];
    return { ok: true, headers: { get: () => 'ai' },
      json: async () => ({ schemaVersion: 1, observationId: context.observation.id, ...answer }) };
  };
}

test('every scenario builds a privacy-approved context', () => {
  for (const s of SCENARIOS) assert.equal(s.context().privacy.rawPiiIncluded, false, s.name);
});

test('correct decisions pass every scenario', async () => {
  const lines = [];
  assert.equal(await runSemantics({ fetchImpl: fakeServer(GOOD), write: (l) => lines.push(l) }), true);
  assert.equal(lines.at(-1), `PASS semantics: ${SCENARIOS.length}/${SCENARIOS.length}`);
});

test('GOAL_ACHIEVED on a ready-but-unfinished state fails (the live step-1 bug)', async () => {
  for (const name of ['form-ready-submit', 'generic-ready-send', 'search-typed-no-results', 'navigate-pending', 'no-target-unfinished']) {
    const lines = [];
    const ok = await runSemantics({ fetchImpl: fakeServer({ ...GOOD, [name]: { action: 'STOP', target: null, reason: ACHIEVED } }),
      write: (l) => lines.push(l) });
    assert.equal(ok, false, name);
    assert.ok(lines.some((l) => l.startsWith(`FAIL ${name}: got STOP:GOAL_ACHIEVED`)), name);
  }
});

test('a missing success claim on a visible result also fails', async () => {
  const ok = await runSemantics({ fetchImpl: fakeServer({ ...GOOD,
    'result-visible': { action: 'STOP', target: null, reason: 'No suitable visual target is available.' } }), write: () => {} });
  assert.equal(ok, false);
});
