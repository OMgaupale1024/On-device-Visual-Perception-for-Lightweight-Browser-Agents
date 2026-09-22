// Phase 13A — unit tests for the STOP classifier, plus a drift guard that ties
// the extension's reason vocabulary to the server's.
//
// The success reason is defined twice by necessity (Python enum + JS constant).
// If they drift apart, success reporting silently breaks or — worse — a reason
// the server considers non-success could stop being classified. These tests read
// the real server files so the coupling cannot rot unnoticed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyStop, STOP_CODE, GOAL_ACHIEVED_REASON } from '../src/shared/outcome-contract.js';

const AI_CONTRACT = new URL('../../server/app/ai_contract.py', import.meta.url);
const PLANNER = new URL('../../server/app/planner.py', import.meta.url);

test('only the achieved-goal reason classifies as success', () => {
  assert.deepEqual(classifyStop(GOAL_ACHIEVED_REASON),
    { code: STOP_CODE.GOAL_ACHIEVED, success: true });
});

test('non-success reasons classify as non-success with a stable code', () => {
  for (const [reason, code] of [
    ['No suitable visual target is available.', STOP_CODE.NO_TARGET],
    ['The request cannot be completed safely.', STOP_CODE.UNSAFE],
    ['Required fields are filled and Continue is visible.', STOP_CODE.NO_PROGRESS],
    ['A suitable visual target is visible.', STOP_CODE.NO_PROGRESS],
    ['Goal is not supported by the deterministic travel planner.', STOP_CODE.UNSUPPORTED_GOAL],
    ['Required travel fields are missing, ambiguous or incomplete.', STOP_CODE.INCOMPLETE_CONTEXT],
    ['A unique Continue visual element is unavailable.', STOP_CODE.NO_TARGET],
  ]) {
    assert.deepEqual(classifyStop(reason), { code, success: false }, reason);
  }
});

test('classification fails closed for unknown, absent and non-string reasons', () => {
  for (const reason of [undefined, null, '', 0, 42, true, {}, [], () => {},
    'Some brand new server reason.', 'The goal is already achieved', 'the goal is already achieved.']) {
    const result = classifyStop(reason);
    assert.equal(result.success, false, `must not succeed: ${String(reason)}`);
    assert.equal(result.code, STOP_CODE.UNCLASSIFIED);
  }
});

test('prototype-chain keys do not leak an inherited value', () => {
  for (const reason of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.deepEqual(classifyStop(reason), { code: STOP_CODE.UNCLASSIFIED, success: false }, reason);
  }
});

test('drift guard: the success constant matches server/app/ai_contract.py', async () => {
  const py = await readFile(AI_CONTRACT, 'utf8');
  const match = py.match(/^GOAL_ACHIEVED_REASON\s*=\s*"([^"]+)"/m);
  assert.ok(match, 'server defines GOAL_ACHIEVED_REASON');
  assert.equal(match[1], GOAL_ACHIEVED_REASON,
    'extension GOAL_ACHIEVED_REASON must equal the server constant');
});

test('drift guard: every server SafeReason value is classified', async () => {
  const py = await readFile(AI_CONTRACT, 'utf8');
  const block = py.match(/SafeReason\s*=\s*Literal\[([\s\S]*?)\]/);
  assert.ok(block, 'SafeReason literal is present');
  const reasons = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(reasons.length >= 5, `expected the full reason vocabulary, saw ${reasons.length}`);
  for (const reason of reasons) {
    assert.notEqual(classifyStop(reason).code, STOP_CODE.UNCLASSIFIED,
      `server SafeReason "${reason}" has no classification — add it to outcome-contract.js`);
  }
  // Exactly one server reason may report success.
  const successes = reasons.filter((r) => classifyStop(r).success);
  assert.deepEqual(successes, [GOAL_ACHIEVED_REASON]);
});

test('drift guard: every deterministic planner STOP reason is classified', async () => {
  const py = await readFile(PLANNER, 'utf8');
  const reasons = [...py.matchAll(/stop\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(reasons.length >= 3, `expected the deterministic STOP reasons, saw ${reasons.length}`);
  for (const reason of reasons) {
    const result = classifyStop(reason);
    assert.notEqual(result.code, STOP_CODE.UNCLASSIFIED,
      `deterministic STOP reason "${reason}" has no classification`);
    // The deterministic planner cannot observe completion, so none of its STOP
    // reasons may report success.
    assert.equal(result.success, false, `deterministic "${reason}" must not report success`);
  }
});
