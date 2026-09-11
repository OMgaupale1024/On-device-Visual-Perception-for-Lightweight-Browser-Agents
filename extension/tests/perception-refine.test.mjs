// Actionable-control OCR refinement (the live "Looe" @ 0.39 -> "Continue" case).
// Pure decision logic only; the crop/preprocess/recognize runs live in the offscreen doc.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRefinements, eligibleForRefine } from '../src/perception/pipeline.js';

const SECRETS = ['Rahul Sharma', 'rahul@example.com', '9876543210', 'EMP1024', 'secret123'];

// visual_17 = the Continue button region; visual_20 = a Password label (not on a control).
const items = () => [
  { id: 'visual_17', text: 'Looe', bbox: { x: 1057, y: 686, width: 406, height: 49 }, confidence: 0.39 },
  { id: 'visual_20', text: 'Password', bbox: { x: 10, y: 120, width: 90, height: 20 }, confidence: 0.95 },
];
const buttonRegion = { x: 1050, y: 680, width: 420, height: 60 };

test('eligibleForRefine: only actionable AND low-confidence elements qualify', () => {
  const eligible = eligibleForRefine(items(), [buttonRegion]);
  assert.deepEqual(eligible.map((i) => i.id), ['visual_17']); // Password label is not on a control
  // A high-confidence actionable element is not re-OCR'd.
  const confident = items(); confident[0].confidence = 0.9;
  assert.deepEqual(eligibleForRefine(confident, [buttonRegion]).map((i) => i.id), []);
});

test('applyRefinements: refined pixel read replaces text/confidence, same id and bbox', () => {
  const eligibleIds = new Set(['visual_17']);
  const refined = [{ id: 'visual_17', text: 'Continue', confidence: 0.9 }];
  const out = applyRefinements(items(), eligibleIds, refined, SECRETS);
  const c = out.find((i) => i.id === 'visual_17');
  assert.equal(c.text, 'Continue');
  assert.equal(c.confidence, 0.9);
  assert.deepEqual(c.bbox, { x: 1057, y: 686, width: 406, height: 49 }); // unchanged
  // Non-eligible element untouched.
  assert.equal(out.find((i) => i.id === 'visual_20').text, 'Password');
});

test('applyRefinements: fails closed — keeps original when refinement is not materially better', () => {
  const ids = new Set(['visual_17']);
  const base = items();
  // Not enough confidence gain.
  assert.equal(applyRefinements(base, ids, [{ id: 'visual_17', text: 'Continue', confidence: 0.45 }], SECRETS)[0].text, 'Looe');
  // Below absolute minimum confidence.
  assert.equal(applyRefinements(base, ids, [{ id: 'visual_17', text: 'Continue', confidence: 0.5 }], SECRETS)[0].text, 'Looe');
  // Empty / missing refined text.
  assert.equal(applyRefinements(base, ids, [{ id: 'visual_17', text: '   ', confidence: 0.95 }], SECRETS)[0].text, 'Looe');
  assert.equal(applyRefinements(base, ids, [], SECRETS)[0].text, 'Looe');
});

test('applyRefinements: refined text is privacy-checked — a PII/secret read is rejected', () => {
  const ids = new Set(['visual_17']);
  for (const leak of ['rahul@example.com', 'EMP1024', '9876543210', 'secret123']) {
    const out = applyRefinements(items(), ids, [{ id: 'visual_17', text: leak, confidence: 0.99 }], SECRETS);
    assert.equal(out[0].text, 'Looe', `must not accept refined text leaking ${leak}`);
  }
});
