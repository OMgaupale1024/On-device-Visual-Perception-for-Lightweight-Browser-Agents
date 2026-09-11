import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classification, ratio, statistics, utf8Bytes, bytesToMiB, scoreVisual, normalizeItem,
  scoreLabels, scoreRedaction, iou, safeMeasurements, machineDuration, SIH_WEIGHTS } from '../src/metrics/metrics.js';
import { detectSensitiveFields } from '../src/privacy/detect.js';
import { parseServerTiming } from '../src/transport/planner-client.js';
import { benchmarkRedaction } from '../../scripts/benchmark-redaction.mjs';

test('official mapping sums to 100; weights are not an invented composite score', () => {
  assert.deepEqual(Object.values(SIH_WEIGHTS), [25, 20, 20, 20, 15]);
});
test('precision recall F1 with independently known confusion matrix', () => {
  assert.deepEqual(classification({ tp: 3, fp: 1, fn: 2, tn: 4 }),
    { tp: 3, fp: 1, fn: 2, tn: 4, precision: 0.75, recall: 0.6, f1: 6 / 9 });
});
test('zero denominators are null, not fabricated perfection; all-missed F1 is zero', () => {
  assert.equal(ratio(0, 0), null);
  const empty = classification({ tp: 0, fp: 0, fn: 0 });
  assert.equal(empty.precision, null); assert.equal(empty.recall, null); assert.equal(empty.f1, null);
  assert.equal(classification({ tp: 0, fp: 0, fn: 3 }).f1, 0);
});
test('invalid negative/fractional confusion counts reject', () => {
  for (const tp of [-1, 0.5, NaN]) assert.throws(() => classification({ tp, fp: 0, fn: 0 }));
});
test('mean median extrema are correct without mutating input', () => {
  const input = [8, 1, 3, 4];
  assert.deepEqual(statistics(input), { count: 4, min: 1, median: 3.5, mean: 4, max: 8 });
  assert.deepEqual(input, [8, 1, 3, 4]); assert.equal(statistics([8, 2, 4]).median, 4);
});
test('statistics empty/singleton/invalid; nearest-rank p95 only at >=20', () => {
  assert.equal(statistics([]).median, null); assert.equal(statistics([2]).mean, 2);
  assert.equal(statistics(Array(19).fill(2)).p95, undefined);
  assert.equal(statistics(Array.from({ length: 20 }, (_, i) => i + 1)).p95, 19);
  for (const value of [NaN, Infinity, -1]) assert.throws(() => statistics([value]));
});
test('UTF-8 bytes and MiB are not string length or RAM', () => {
  assert.equal(utf8Bytes('Aé😀'), 7); assert.equal(bytesToMiB(1048576), 1);
});
const visual = (...text) => ({ source: 'local-pixel-ocr', items: text.map((text) => ({ source: 'visual', text })) });
test('exact pixel item matches case and whitespace normalization', () => {
  assert.equal(scoreVisual(['Travel Request Submitted'], visual('  TRAVEL  Request\n Submitted ')).accuracy, 1);
});
test('punctuation is retained; spacing normalized; no fuzzy match or joined lines', () => {
  assert.equal(normalizeItem('Hi  ! '), 'hi!');
  assert.equal(scoreVisual(['Travel Request Submitted'], visual('Travel Request', 'Submitted')).missed, 1);
  assert.equal(scoreVisual(['Continue'], visual('Cont1nue')).correct, 0);
  assert.equal(scoreVisual(['Continue'], visual('Continue!')).correct, 0);
});
test('miss/unexpected handling and duplicate one-to-one assignment', () => {
  const result = scoreVisual(['Continue', 'Cancel', 'Continue'], visual('Continue', 'Save'));
  assert.equal(result.correct, 1); assert.equal(result.missed, 2); assert.equal(result.unexpected, 1);
  assert.deepEqual(result.missedIndexes, [1, 2]); assert.equal(result.accuracy, 1 / 3);
  assert.equal(scoreVisual([], visual()).accuracy, null);
});
test('semantic DOM predictions are rejected, even with exact words', () => {
  assert.throws(() => scoreVisual(['Continue'], { source: 'local-browser-semantics', items: [{ text: 'Continue' }] }));
  assert.throws(() => scoreVisual(['Continue'], { ...visual('Continue'), items: [{ source: 'semantic', text: 'Continue' }] }));
});
test('binary detection and per-role errors count category confusion', () => {
  const r = scoreLabels(['name', 'email', 'other'], ['email', 'other', 'phone'], ['name', 'email', 'phone']);
  assert.deepEqual([r.overall.tp, r.overall.fp, r.overall.fn], [1, 1, 1]);
  assert.equal(r.perCategory.name.fn, 1); assert.equal(r.perCategory.email.fp, 1);
  assert.throws(() => scoreLabels(['name'], [], ['name']));
});
test('actual detector on labeled difficult fixture yields TP/TN and exposes FP/FN', async () => {
  const d = JSON.parse(await readFile(new URL('../../benchmarks/fixtures/pii.json', import.meta.url)));
  const predicted = detectSensitiveFields(d.rows.map((r) => ({ id: r.id, ...r.signal })));
  const score = scoreLabels(d.rows.map((r) => r.expected), predicted.map((p) => p.role), d.roles);
  assert.equal(d.rows.length, 40);
  for (const key of ['tp', 'tn', 'fp', 'fn']) assert.ok(score.overall[key] > 0);
});
const b = (x = 0, width = 10) => ({ x, y: 0, width, height: 10 });
test('IoU exact, disjoint and partial overlap', () => {
  assert.equal(iou(b(), b()), 1); assert.equal(iou(b(), b(20)), 0); assert.equal(iou(b(), b(5)), 1 / 3);
  assert.throws(() => iou(b(), b(0, 0)));
});
test('redaction counts correct, missed, unnecessary and damaged safe regions', () => {
  const r = scoreRedaction([b(), b(20)], [b(40), b(60)], [b(), b(40)]);
  assert.deepEqual([r.correct, r.missed, r.unnecessary, r.safeDamaged], [1, 1, 1, 1]);
  assert.equal(r.precision, 0.5); assert.equal(r.recall, 0.5); assert.equal(r.safePreservation, 0.5);
});
test('partial masks fail IoU threshold and duplicates cannot inflate recall', () => {
  assert.equal(scoreRedaction([b()], [], [b(5)]).correct, 0);
  const r = scoreRedaction([b()], [], [b(), b()]); assert.equal(r.correct, 1); assert.equal(r.precision, 0.5);
  assert.equal(scoreRedaction([], [], []).precision, null);
});
test('even small safe-region overlap is damage, not hidden by IoU threshold', () => {
  assert.equal(scoreRedaction([], [b()], [b(9)]).safeDamaged, 1);
});
test('actual redaction module command benchmark preserves non-perfect results', async () => {
  const d = JSON.parse(await readFile(new URL('../../benchmarks/fixtures/pii.json', import.meta.url)));
  const r = await benchmarkRedaction(d.rows);
  assert.equal(r.quality.samples, 3); assert.ok(r.quality.missed > 0); assert.ok(r.quality.unnecessary > 0);
  assert.equal(r.performance.count, 30); assert.equal(r.quality.results[2].recall, 1);
});
test('safe telemetry accepts only fixed finite numeric fields, no payload/string/secret', () => {
  assert.deepEqual(safeMeasurements({ planMs: 12, captureMs: NaN, clickDispatchMs: -1,
    rawScreenshot: 'private', goal: 'secret', safeContextBytes: 1024, arbitrary: 4 }), { planMs: 12, safeContextBytes: 1024 });
});
test('machine duration excludes human confirmation and missing segments remain unavailable', () => {
  assert.equal(machineDuration(120, 800), 920); assert.equal(machineDuration(undefined, 800), null);
});
test('server timing parser only accepts fixed bounded numeric labels', () => {
  assert.deepEqual(parseServerTiming('prehandler;dur=1.25, planner;dur=2.5'), { prehandlerMs: 1.25, plannerMs: 2.5 });
  for (const value of [null, 'credential;dur=123', 'planner;dur=secret', 'planner;dur=-1', 'planner;dur=999999', 'x'.repeat(201)]) assert.deepEqual(parseServerTiming(value), {});
});
