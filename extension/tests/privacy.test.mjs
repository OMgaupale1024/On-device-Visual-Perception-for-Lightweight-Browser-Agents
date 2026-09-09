import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRect, sensitiveRegions } from '../src/privacy/geometry.js';
import { checkOutbound } from '../src/privacy/guard.js';
import { sanitizeSemantics } from '../src/privacy/semantic.js';
import { buildOutboundPackage, redactScreenshot } from '../src/privacy/redact.js';

const viewport = { width: 1000, height: 500 };
const rect = { x: 100, y: 50, width: 200, height: 40 };
const roles = ['name', 'email', 'phone', 'employee_id', 'password', 'destination', 'purpose'];
// Synthetic fixture data only. Never captured user values.
const values = ['Test Person', 'test@example.invalid', '5550101234', 'EMP-TEST-17', 'test-only-password', 'Bengaluru', 'Conference'];
const fields = roles.map((role, i) => ({ id: `field_${i + 1}`, role: i < 5 ? role : 'other', sensitive: i < 5, rect }));
const signals = roles.map((role, i) => ({ id: `field_${i + 1}`, name: role, elementId: role, label: values[0] }));
const local = values.map((value, i) => ({ id: `field_${i + 1}`, value }));
const secrets = values.slice(0, 5);
const semantic = () => sanitizeSemantics(fields, signals, local);

test('CSS viewport maps to screenshot pixels at 1x', () => assert.deepEqual(mapRect(rect, viewport, viewport), rect));
test('HiDPI maps both axes at 2x', () => assert.deepEqual(mapRect(rect, viewport, { width: 2000, height: 1000 }), { x: 200, y: 100, width: 400, height: 80 }));
test('uses actual nonuniform screenshot ratios, not DPR', () => assert.deepEqual(mapRect(rect, viewport, { width: 1500, height: 1000 }), { x: 150, y: 100, width: 300, height: 80 }));
test('clamps partially clipped rectangles on every edge', () => assert.deepEqual(mapRect({ x: -20, y: -10, width: 1100, height: 600 }, viewport, viewport), { x: 0, y: 0, width: 1000, height: 500 }));
test('rounds fractional boundaries outward', () => assert.deepEqual(mapRect({ x: 1.1, y: 2.2, width: 3.3, height: 4.4 }, viewport, viewport), { x: 1, y: 2, width: 4, height: 5 }));
test('fully outside rectangle returns null', () => assert.equal(mapRect({ ...rect, x: 1200 }, viewport, viewport), null));
test('zero, negative, infinite, missing dimensions fail closed', () => {
  for (const width of [0, -1, NaN, Infinity, undefined]) assert.throws(() => mapRect(rect, { width, height: 500 }, viewport));
  assert.throws(() => mapRect({ ...rect, x: NaN }, viewport, viewport));
  assert.throws(() => sensitiveRegions([], viewport, { width: 0, height: 0 }));
});
test('selects exactly five sensitive regions; destination and purpose excluded', () => {
  assert.deepEqual(sensitiveRegions(fields, viewport, viewport).map((f) => f.role), roles.slice(0, 5));
});
test('missing or offscreen sensitive geometry blocks', () => {
  assert.throws(() => sensitiveRegions([{ sensitive: true }], viewport, viewport));
  assert.throws(() => sensitiveRegions([{ sensitive: true, rect: { ...rect, x: 1200 } }], viewport, viewport));
});
test('semantic placeholders and safe demo values', () => {
  assert.deepEqual(semantic().fields.map((f) => f.value), ['[NAME]', '[EMAIL]', '[PHONE]', '[EMPLOYEE_ID]', '[PASSWORD]', 'Bengaluru', 'Conference']);
  assert.equal(checkOutbound(semantic(), secrets).safe, true);
});
test('filled status exposes no raw sensitive values', () => {
  assert.ok(semantic().fields.every((f) => f.filled));
  const empty = local.map((v) => ({ ...v, value: '' }));
  const result = sanitizeSemantics(fields, signals, empty);
  assert.ok(result.fields.every((f) => !f.filled));
  assert.equal(result.fields[0].value, '[NAME]');
  assert.ok(secrets.every((v) => !JSON.stringify(semantic()).includes(v)));
});
test('untrusted labels omitted and unknown non-sensitive strings withheld', () => {
  const tainted = local.map((v) => ({ ...v, value: secrets[1] }));
  const result = sanitizeSemantics(fields, signals, tainted);
  assert.equal(result.fields[5].value, '[WITHHELD]');
  assert.ok(!JSON.stringify(result).includes(signals[0].label));
  assert.equal(checkOutbound(result, secrets).safe, true);
});
test('invalid identity or missing values blocks semantic generation', () => {
  assert.throws(() => sanitizeSemantics([{ ...fields[0], id: secrets[0] }], signals, local));
  assert.throws(() => sanitizeSemantics(fields, signals, []));
});
test('guard accepts fully sanitized nested payload', () => assert.deepEqual(checkOutbound({ data: [semantic()] }, secrets), { safe: true }));
for (let i = 0; i < 5; i++) test(`guard rejects raw ${roles[i]} without leaking it in error`, () => {
  const result = checkOutbound({ nested: [{ deeper: 'prefix ' + secrets[i] + ' suffix' }] }, secrets);
  assert.deepEqual(result, { safe: false, reason: 'Sensitive data detected in outbound payload' });
  assert.ok(!JSON.stringify(result).includes(secrets[i]));
});
test('guard checks object keys and numeric phone values', () => {
  assert.equal(checkOutbound({ [secrets[1]]: true }, secrets).safe, false);
  assert.equal(checkOutbound({ phone: Number(secrets[2]) }, secrets).safe, false);
});
test('guard handles empty values but fails closed on cycles, accessors and custom objects', () => {
  assert.equal(checkOutbound(semantic(), ['']).safe, true);
  const cycle = {}; cycle.self = cycle;
  assert.equal(checkOutbound(cycle, secrets).safe, false);
  assert.equal(checkOutbound({ get field() { throw new Error('not evaluated'); } }, secrets).safe, false);
  assert.equal(checkOutbound(new Date(), secrets).safe, false);
  assert.equal(checkOutbound({}, undefined).safe, false);
});
test('builder rejects raw screenshots and forged sanitized handles', () => {
  assert.throws(() => buildOutboundPackage('data:image/png;base64,raw', semantic(), secrets), /Sanitized image required/);
  assert.throws(() => buildOutboundPackage({ dataUrl: 'raw', sanitized: true }, semantic(), secrets), /Sanitized image required/);
});

// Canvas API DOUBLE, not real browser pixel proof. The browser suite checks actual pixels.
test('redaction pipeline masks full boxes, closes resources, guards and freezes package', async () => {
  const calls = [];
  let closed = false;
  const previousBitmap = globalThis.createImageBitmap;
  const previousCanvas = globalThis.OffscreenCanvas;
  globalThis.createImageBitmap = async () => ({ ...viewport, close() { closed = true; } });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { drawImage() {}, fillRect(...args) { calls.push(args); }, set fillStyle(value) { assert.equal(value, '#000'); } }; }
    async convertToBlob() { return new Blob([JSON.stringify(calls)]); }
  };
  try {
    const visual = await redactScreenshot('data:image/png;base64,AA==', fields, viewport);
    assert.equal(visual.redactedRegions, 5);
    assert.equal(calls.length, 6); // password original + five sanitized regions
    assert.ok(calls.every((args) => JSON.stringify(args) === JSON.stringify([100, 50, 200, 40])));
    assert.ok(closed);
    const candidate = semantic();
    const outbound = buildOutboundPackage(visual.handle, candidate, secrets);
    assert.ok(!('original' in outbound));
    assert.notEqual(outbound.image.dataUrl, visual.originalPreview);
    candidate.fields[0].value = secrets[0];
    assert.equal(outbound.semantic.fields[0].value, '[NAME]');
    assert.throws(() => { outbound.semantic.fields[0].value = secrets[0]; });
    assert.throws(() => buildOutboundPackage(visual.handle, candidate, secrets), /Sensitive data detected/);
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    globalThis.OffscreenCanvas = previousCanvas;
  }
});
