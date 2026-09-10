import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeBBox, normalizeResult } from '../src/perception/normalize.js';
import { sanitizeVisual } from '../src/privacy/visual.js';
import { overlapsSensitive } from '../src/privacy/overlap.js';
import { sensitiveRegions } from '../src/privacy/geometry.js';
import { localOptions } from '../src/perception/config.js';
import { sanitizedImageForPerception } from '../src/privacy/redact.js';
import { clearWorkerImage } from '../src/perception/cleanup.js';
const fixture = (text = 'Destination') => ({ data: { text, blocks: [{ paragraphs: [{ lines: [{ text, confidence: 92, bbox: { x0: 10, y0: 20, x1: 180, y1: 50 } }] }] }] }, width: 800, height: 600,
  timing: { cold: true, initializationMs: 100, inferenceMs: 200, totalMs: 300 } });
const demo = await readFile(new URL('../../demo-page/index.html', import.meta.url), 'utf8');
const secrets = ['employeeName', 'email', 'phone', 'employeeId', 'password'].map((id) => demo.match(new RegExp(`<input id="${id}"[^>]*value="([^"]*)"`))[1]);
const clean = (raw, regions = []) => sanitizeVisual(raw, secrets, regions);
const linesOf = (raw) => raw.data.blocks[0].paragraphs[0].lines;

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
    const raw = fixture(); linesOf(raw)[0].confidence = confidence;
    assert.equal(normalizeResult(raw).items[0].confidence, null);
  }
});
test('blank actual OCR result is Empty, malformed data or missing geometry is ERROR', () => {
  const raw = fixture(); raw.data = { text: '', blocks: null };
  assert.equal(clean(raw).status, 'Empty');
  assert.equal(clean({ data: {} }).status, 'ERROR');
  assert.equal(sanitizeVisual(fixture(), secrets).status, 'ERROR');
  assert.equal(clean(fixture(), [{ x: 0, y: 0, width: NaN, height: 2 }]).status, 'ERROR');
  assert.throws(() => normalizeResult({ ...fixture(), data: { text: 'Destination' } }));
  assert.throws(() => normalizeResult({ ...fixture(), width: 0 }));
});
test('actual nonsensitive strings are retained without a fixed vocabulary', () => {
  for (const text of ['Destination', 'Bengaluru', 'Purpose', 'Conference', 'Continue', 'New trip details']) {
    assert.equal(clean(fixture(text + '\n')).value.items[0].text, text);
  }
});
for (let i = 0; i < secrets.length; i++) test(`known fake PII category ${i + 1} omitted from safe visual output`, () => {
  const result = clean(fixture(secrets[i]));
  assert.equal(result.status, 'Empty'); assert.equal(result.value.withheldItems, 1);
  assert.ok(!JSON.stringify(result).includes(secrets[i]));
});
test('case/whitespace variants are removed; nested unused raw fields never enter safe schema', () => {
  assert.equal(clean(fixture(secrets[0].toUpperCase().replace(' ', '\n '))).status, 'Empty');
  const raw = fixture(); raw.data.unused = { nested: [secrets[1]] };
  const result = clean(raw);
  assert.equal(result.status, 'Ready');
  assert.ok(secrets.every((value) => !JSON.stringify(result).includes(value)));
});
test('any sensitive overlap removes the whole line, including OCR-misread PII', () => {
  const box = { x: 10, y: 20, width: 170, height: 30 };
  for (const region of [box, { x: 179, y: 49, width: 10, height: 10 }, { x: 181, y: 20, width: 10, height: 10 }]) {
    assert.equal(overlapsSensitive(box, [region]), true);
    assert.equal(clean(fixture('unrecognized private glyphs'), [region]).value.items.length, 0);
  }
  assert.equal(overlapsSensitive(box, [{ x: 182, y: 20, width: 10, height: 10 }]), false);
});
test('CSS sensitive regions use Phase 3 actual image scaling before OCR filtering', () => {
  const regions = sensitiveRegions([{ id: 'field_1', role: 'name', sensitive: true, rect: { x: 5, y: 10, width: 85, height: 15 } },
    { id: 'field_2', role: 'destination', sensitive: false, rect: { x: 200, y: 100, width: 85, height: 15 } }],
  { width: 400, height: 300 }, { width: 800, height: 600 });
  assert.equal(regions.length, 1);
  assert.equal(clean(fixture(), regions).status, 'Empty');
});
test('IDs remain stable within an observation and retain boxes after filtering', () => {
  const raw = fixture(secrets[0]);
  linesOf(raw).push({ text: 'Continue', confidence: 95, bbox: { x0: 10, y0: 80, x1: 120, y1: 110 } });
  const first = clean(raw), second = clean(raw);
  assert.deepEqual(first, second);
  assert.equal(first.value.items[0].id, 'visual_2');
  assert.deepEqual(first.value.items[0].bbox, { x: 10, y: 80, width: 110, height: 30 });
});
test('obvious email/phone/employee-ID outside known fields are removed', () => {
  // Derive variants from the existing fake fixture, but give the guard no known
  // values/regions: these removals must come from conservative text rules alone.
  for (const text of [secrets[1].replace('@', ' @ ').replace('.', ' . '),
    secrets[2].split('').join(' '), secrets[3].replace('EMP', 'EMP-')]) {
    assert.equal(sanitizeVisual(fixture(text), [], []).status, 'Empty');
  }
});
test('residual known name fragmented over lines blocks without leaking the value', () => {
  const parts = secrets[0].split(' ');
  const raw = fixture(parts[0]);
  linesOf(raw).push({ ...linesOf(raw)[0], text: parts.slice(1).join(' ') });
  const result = clean(raw);
  assert.equal(result.status, 'UNSAFE');
  assert.ok(!('value' in result));
  assert.ok(!JSON.stringify(result).includes(secrets[0]));
});
test('only extension-local explicit assets, no blobs, caches or default CDN paths', () => {
  const options = localOptions('chrome-extension://test/');
  for (const key of ['workerPath', 'corePath', 'langPath']) assert.ok(options[key].startsWith('chrome-extension://test/vendor/ocr/'));
  assert.equal(options.workerBlobURL, false); assert.equal(options.cacheMethod, 'none');
  assert.throws(() => localOptions('https://cdn.example/'));
});
test('sanitized image registry still rejects raw URLs and forged handles', () => {
  assert.throws(() => sanitizedImageForPerception('data:image/png;base64,AA=='));
  assert.throws(() => sanitizedImageForPerception({ sanitized: true }));
});
test('OCR has no DOM text or semantic fallback and recognizes PNG bytes', async () => {
  const source = await readFile(new URL('../src/perception/ocr.js', import.meta.url), 'utf8');
  assert.ok(!/document\.|querySelector|innerText|textContent|fieldSignals|detectSensitive|sanitizeSemantics/.test(source));
  assert.match(source, /worker\.recognize\(bytes/);
  assert.match(source, /atob\(image\.dataUrl/);
  assert.ok(!source.includes('Destination'));
});
test('warm worker cleanup replaces retained raster with blank PNG then unlinks input', async () => {
  const calls = [];
  await clearWorkerImage({ async recognize(bytes, options, output) {
    assert.equal(new DataView(bytes.buffer).getUint32(16), 16);
    assert.equal(new DataView(bytes.buffer).getUint32(20), 16);
    assert.deepEqual(output, { text: false, blocks: false }); calls.push('replace');
  }, async removeFile(path) { assert.equal(path, '/input'); calls.push('unlink'); } });
  assert.deepEqual(calls, ['replace', 'unlink']);
});
