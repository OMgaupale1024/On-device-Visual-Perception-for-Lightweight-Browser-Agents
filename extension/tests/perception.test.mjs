import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeBBox, normalizeResult } from '../src/perception/normalize.js';
import { sanitizeVisual } from '../src/privacy/visual.js';
import { localOptions } from '../src/perception/config.js';
import { sanitizedImageForPerception } from '../src/privacy/redact.js';
const fixture = (text = 'Destination') => ({ data: { text, blocks: [{ paragraphs: [{ lines: [{ text, confidence: 92, bbox: { x0: 10, y0: 20, x1: 180, y1: 50 } }] }] }] }, width: 800, height: 600,
  timing: { cold: true, initializationMs: 100, inferenceMs: 200, totalMs: 300 } });
// Reuse existing fake demo values, never record new captured PII fixtures.
const demo = await readFile(new URL('../../demo-page/index.html', import.meta.url), 'utf8');
const secrets = ['employeeName', 'email', 'phone', 'employeeId', 'password'].map((id) => demo.match(new RegExp(`<input id="${id}"[^>]*value="([^"]*)"`))[1]);
test('normalization emits actual line text, pixel boxes, 0..1 confidence and timings', () => {
  const value = normalizeResult(fixture());
  assert.deepEqual(value.items[0], { id: 'visual_1', text: 'Destination', bbox: { x: 10, y: 20, width: 170, height: 30 }, confidence: 0.92 });
  assert.equal(value.processingMs, 300);
  assert.equal(value.coordinateSystem, 'screenshot-pixels');
});
test('bbox clamps image edges and rounds outward; malformed/reversed boxes reject', () => {
  assert.deepEqual(normalizeBBox({ x0: -10, y0: 1.5, x1: 810, y1: 700 }, 800, 600), { x: 0, y: 1, width: 800, height: 599 });
  for (const box of [null, {}, { x0: 3, x1: 1, y0: 0, y1: 4 }]) assert.throws(() => normalizeBBox(box, 800, 600));
});
test('missing or invalid confidence is null, never invented', () => {
  for (const confidence of [undefined, null, NaN, 101, -1, '92']) {
    const raw = fixture(); raw.data.blocks[0].paragraphs[0].lines[0].confidence = confidence;
    assert.equal(normalizeResult(raw).items[0].confidence, null);
  }
});
test('blank actual OCR result is Empty, malformed data is ERROR', () => {
  const raw = fixture(); raw.data = { text: '', blocks: null };
  assert.equal(sanitizeVisual(raw, secrets).status, 'Empty');
  assert.equal(sanitizeVisual({ data: {} }, secrets).status, 'ERROR');
  assert.throws(() => normalizeResult({ ...fixture(), data: { text: 'Destination' } }));
  assert.throws(() => normalizeResult({ ...fixture(), width: 0 }));
});
test('output sanitizer preserves only actual safe OCR strings; unknown lines withheld', () => {
  assert.equal(sanitizeVisual(fixture('Destination\n'), secrets).value.items[0].text, 'Destination');
  const other = sanitizeVisual(fixture('Untrusted Unknown Text'), secrets);
  assert.equal(other.value.items.length, 0); assert.equal(other.value.withheldItems, 1);
});
for (let i = 0; i < secrets.length; i++) test(`known fake PII category ${i + 1} blocks all visual output`, () => {
  const result = sanitizeVisual(fixture(secrets[i]), secrets);
  assert.equal(result.status, 'UNSAFE'); assert.ok(!JSON.stringify(result).includes(secrets[i]));
  assert.ok(!('value' in result));
});
test('case/whitespace differences in recognized sensitive text also block', () => {
  assert.equal(sanitizeVisual(fixture(secrets[0].toUpperCase().replace(' ', '\n ')), secrets).status, 'UNSAFE');
});
test('guard checks discarded nested engine text and serialization contains no raw PII', () => {
  const raw = fixture(); raw.data.unused = { nested: [secrets[1]] };
  assert.equal(sanitizeVisual(raw, secrets).status, 'UNSAFE');
  const result = sanitizeVisual(fixture(), secrets);
  assert.ok(secrets.every((value) => !JSON.stringify(result).includes(value)));
});
test('only extension-local explicit assets, no blobs, caches or default CDN paths', () => {
  const options = localOptions('chrome-extension://test/');
  for (const key of ['workerPath', 'corePath', 'langPath']) assert.ok(options[key].startsWith('chrome-extension://test/vendor/ocr/'));
  assert.equal(options.workerBlobURL, false); assert.equal(options.cacheMethod, 'none');
  assert.throws(() => localOptions('https://cdn.example/'));
});
test('perception capability rejects raw data URLs and forged handles', () => {
  assert.throws(() => sanitizedImageForPerception('data:image/png;base64,AA=='));
  assert.throws(() => sanitizedImageForPerception({ sanitized: true }));
});
test('OCR implementation has no DOM text or semantic fallback and recognizes PNG bytes', async () => {
  const source = await readFile(new URL('../src/perception/ocr.js', import.meta.url), 'utf8');
  assert.ok(!/document\.|querySelector|innerText|textContent|fieldSignals|detectSensitive|sanitizeSemantics/.test(source));
  assert.match(source, /worker\.recognize\(bytes/);
  assert.match(source, /atob\(image\.dataUrl/);
  assert.ok(!source.includes('Destination')); // no expected vocabulary in inference
});
