import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSafeAgentContext, serializeSafeAgentContext, validateGoal, SCHEMA_VERSION }
  from '../src/privacy/agent-context.js';

// The exact fake demo secrets (demo-page/index.html). NONE may appear in a safe context.
const SECRETS = ['Rahul Sharma', 'rahul@example.com', '9876543210', 'EMP1024', 'secret123'];
const DEMO_GOAL = 'Check whether this travel request is complete and submit it.';

const semanticFixture = () => ({ fields: [
  { id: 'field_1', role: 'name', sensitive: true, value: '[NAME]', filled: true },
  { id: 'field_2', role: 'email', sensitive: true, value: '[EMAIL]', filled: true },
  { id: 'field_3', role: 'phone', sensitive: true, value: '[PHONE]', filled: true },
  { id: 'field_4', role: 'employee_id', sensitive: true, value: '[EMPLOYEE_ID]', filled: true },
  { id: 'field_5', role: 'password', sensitive: true, value: '[PASSWORD]', filled: true },
  { id: 'field_6', role: 'destination', sensitive: false, value: 'Bengaluru', filled: true },
  { id: 'field_7', role: 'purpose', sensitive: false, value: 'Conference', filled: true },
] });
const visualFixture = () => ({ items: [
  { id: 'visual_1', text: 'Destination', bbox: { x: 10, y: 20, width: 100, height: 20 }, confidence: 0.92 },
  { id: 'visual_2', text: 'Bengaluru', bbox: { x: 120, y: 20, width: 90, height: 20 }, confidence: 0.9 },
  { id: 'visual_3', text: 'Continue', bbox: { x: 10, y: 200, width: 80, height: 30 }, confidence: 0.95 },
], withheldItems: 1, coordinateSystem: 'screenshot-pixels', width: 800, height: 600 });
const observationFixture = () => ({ id: 'obs_test-123', capturedAt: '2026-09-10T00:00:00.000Z', viewport: { width: 800, height: 600 } });

const build = (over = {}) => buildSafeAgentContext({
  goal: DEMO_GOAL, semantic: semanticFixture(), visualState: visualFixture(),
  image: { width: 800, height: 600, redactedRegions: 5 }, observation: observationFixture(),
  sensitiveValues: SECRETS, ...over,
});
const ready = () => { const r = build(); assert.equal(r.status, 'READY'); return r; };

test('construction produces a versioned, frozen, correctly shaped context', () => {
  const { context } = ready();
  assert.equal(context.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(Object.keys(context).sort(),
    ['actionCandidates', 'fields', 'goal', 'observation', 'privacy', 'redactionScheme', 'schemaVersion', 'visualElements']);
  assert.ok(Object.isFrozen(context) && Object.isFrozen(context.observation) && Object.isFrozen(context.fields));
});

test('actionCandidates keeps only real, deduped visual ids — never fabricated controls', () => {
  // visual_3 is Continue (real); visual_99 is not a real OCR element and must be dropped.
  const { context } = build({ actionCandidates: ['visual_3', 'visual_3', 'visual_99', 'not-a-visual'] });
  assert.deepEqual(context.actionCandidates, ['visual_3']);
  const ids = new Set(context.visualElements.map((v) => v.id));
  assert.ok(context.actionCandidates.every((id) => ids.has(id)));
});

test('actionCandidates defaults to empty when none supplied', () => {
  assert.deepEqual(ready().context.actionCandidates, []);
});

test('goal is validated: type-coerced, whitespace-collapsed, trimmed, length-capped', () => {
  assert.equal(validateGoal(undefined), '');
  assert.equal(validateGoal(42), '');
  assert.equal(validateGoal('  hello \n  world  '), 'hello world');
  assert.equal(validateGoal('x'.repeat(999)).length, 500);
  assert.equal(build({ goal: 12345 }).context.goal, '');
  assert.equal(build({ goal: '  ' + DEMO_GOAL + '  ' }).context.goal, DEMO_GOAL);
  assert.equal(ready().context.goal, DEMO_GOAL);
});

test('observation metadata retained; missing/invalid observation rejected', () => {
  assert.equal(ready().context.observation.id, 'obs_test-123');
  assert.equal(ready().context.observation.capturedAt, '2026-09-10T00:00:00.000Z');
  assert.deepEqual(ready().context.observation.viewport, { width: 800, height: 600 });
  assert.equal(ready().context.observation.coordinateSystem, 'screenshot-pixels');
  assert.throws(() => build({ observation: undefined }));
  assert.throws(() => build({ observation: { ...observationFixture(), id: 'bad-id' } }));
  assert.throws(() => build({ observation: { ...observationFixture(), capturedAt: undefined } }));
  assert.throws(() => build({ observation: { ...observationFixture(), viewport: { width: 'x', height: 1 } } }));
});

test('safe semantic fields retained with provenance; sensitive as placeholders only', () => {
  const { context } = ready();
  assert.equal(context.fields.length, 7);
  assert.ok(context.fields.every((f) => f.source === 'semantic'));
  const email = context.fields.find((f) => f.role === 'email');
  assert.deepEqual(email, { id: 'field_2', role: 'email', sensitive: true, filled: true, value: '[EMAIL]', source: 'semantic' });
  for (const f of context.fields.filter((f) => f.sensitive)) assert.match(f.value, /^\[[A-Z_]+\]$/);
  const dest = context.fields.find((f) => f.role === 'destination');
  assert.equal(dest.value, 'Bengaluru'); // non-sensitive safe value preserved
});

test('safe visual elements retained with bbox, confidence and visual provenance', () => {
  const { context } = ready();
  assert.equal(context.visualElements.length, 3);
  assert.ok(context.visualElements.every((v) => v.source === 'visual'));
  const cont = context.visualElements.find((v) => v.text === 'Continue');
  assert.deepEqual(cont.bbox, { x: 10, y: 200, width: 80, height: 30 });
  assert.equal(cont.confidence, 0.95);
  assert.equal(cont.id, 'visual_3'); // observation-scoped id preserved for future grounding
});

test('DOM and visual provenance never conflated', () => {
  const { context } = ready();
  assert.ok(context.fields.every((f) => f.source === 'semantic' && !('bbox' in f)));
  assert.ok(context.visualElements.every((v) => v.source === 'visual' && !('role' in v)));
});

test('missing visual state still yields semantic context (graceful OCR failure)', () => {
  const { context, status } = build({ visualState: null });
  assert.equal(status, 'READY');
  assert.equal(context.visualElements.length, 0);
  assert.equal(context.fields.length, 7);
});

test('redaction legend maps present placeholders to descriptions, never values', () => {
  const { context } = ready();
  assert.deepEqual(Object.keys(context.redactionScheme).sort(),
    ['[EMAIL]', '[EMPLOYEE_ID]', '[NAME]', '[PASSWORD]', '[PHONE]']);
  assert.equal(context.redactionScheme['[EMAIL]'], 'filled email address hidden locally');
  for (const desc of Object.values(context.redactionScheme)) {
    assert.ok(SECRETS.every((s) => !desc.includes(s)));
  }
});

test('no raw screenshot bytes enter the context (image is metadata only)', () => {
  const { context } = build({ image: { width: 800, height: 600, redactedRegions: 5, dataUrl: 'data:image/png;base64,AAAA' } });
  assert.deepEqual(context.observation.image, { width: 800, height: 600, redactedRegions: 5 });
  assert.ok(!serializeSafeAgentContext(context).includes('data:image'));
});

test('privacy guard FAILS CLOSED — deliberate contamination via every fake secret', () => {
  for (const secret of SECRETS) {
    // Through the goal (top-level string).
    assert.equal(build({ goal: `please email ${secret} now` }).status, 'BLOCKED');
    // Through a semantic field value (nested).
    const s = semanticFixture(); s.fields[5].value = secret;
    assert.equal(build({ semantic: s }).status, 'BLOCKED');
    // Through visual OCR text (nested) — proves raw OCR cannot leak through.
    const v = visualFixture(); v.items[0].text = secret;
    assert.equal(build({ visualState: v }).status, 'BLOCKED');
  }
  const blocked = build({ goal: `contact ${SECRETS[1]}` });
  assert.equal(blocked.status, 'BLOCKED');
  assert.ok(!('context' in blocked));
  assert.ok(!blocked.reason.includes(SECRETS[1])); // generic reason, no PII echoed
});

test('serialized safe context contains none of the known fake PII', () => {
  const { context, bytes } = ready();
  const serialized = serializeSafeAgentContext(context);
  for (const secret of SECRETS) assert.ok(!serialized.includes(secret), `leaked: ${secret}`);
  // Byte measurement matches the exact serialized UTF-8 length and is positive.
  assert.equal(bytes, new TextEncoder().encode(serialized).length);
  assert.ok(bytes > 0);
  assert.equal(context.privacy.rawPiiIncluded, false);
});

test('malformed safe inputs are rejected', () => {
  assert.throws(() => build({ semantic: { fields: 'not-an-array' } }));
  assert.throws(() => build({ semantic: { fields: [{ id: 'field_1', role: 'name', sensitive: true }] } })); // missing value/filled
  const v = visualFixture(); delete v.items[0].bbox;
  assert.throws(() => build({ visualState: v }));
  assert.throws(() => build({ image: undefined }));
  assert.throws(() => build({ image: { width: 800, height: 600, redactedRegions: -1 } }));
  assert.throws(() => build({ sensitiveValues: [1, 2, 3] }));
});
