import { redactScreenshot } from '../extension/src/privacy/redact.js';
import { detectSensitiveFields } from '../extension/src/privacy/detect.js';
import { scoreRedaction, statistics } from '../extension/src/metrics/metrics.js';

// Measures real final Canvas mask commands using a small instrumented adapter.
// NOT a native Canvas pixel-opacity test and NOT browser redaction latency.
export async function benchmarkRedaction(rows) {
  const cases = [1, 1.25].map((scale) => ({ id: `signals-scale-${scale}`, viewport: { width: 1000, height: 1300 },
    image: { width: 1000 * scale, height: 1300 * scale },
    fields: rows.map((row, i) => ({ ...row.signal, id: `field_${i + 1}`,
      rect: { x: 20 + (i % 2) * 480, y: 20 + Math.floor(i / 2) * 60, width: 400, height: 40 } })),
    // Ground truth uses fixed layout labels, not detector output or mapRect.
    truth: rows.map((row, i) => ({ sensitive: row.expected !== 'other',
      x: (20 + (i % 2) * 480) * scale, y: (20 + Math.floor(i / 2) * 60) * scale,
      width: 400 * scale, height: 40 * scale })) }));
  cases.push({ id: 'fractional-clipped', viewport: { width: 1000, height: 500 }, image: { width: 1000, height: 500 },
    fields: [{ id: 'field_1', type: 'email', rect: { x: -5.5, y: 10.2, width: 100, height: 20.1 } },
      { id: 'field_2', label: 'Destination', rect: { x: 200, y: 10, width: 100, height: 30 } }],
    truth: [{ sensitive: true, x: 0, y: 10, width: 95, height: 21 },
      { sensitive: false, x: 200, y: 10, width: 100, height: 30 }] });
  const previous = { createImageBitmap: globalThis.createImageBitmap, OffscreenCanvas: globalThis.OffscreenCanvas };
  const results = [], runs = [];
  try {
    for (const fixture of cases) {
      let masks;
      globalThis.createImageBitmap = async () => ({ ...fixture.image, close() {} });
      globalThis.OffscreenCanvas = class {
        commands = [];
        getContext() { return { drawImage() {}, set fillStyle(v) { if (v !== '#000') throw Error('Unexpected fill'); },
          fillRect: (x, y, width, height) => this.commands.push({ x, y, width, height }) }; }
        async convertToBlob() {
          masks = this.commands.splice(0); // First encode is original password preview; second is final redaction.
          return new Blob([JSON.stringify(masks)]);
        }
      };
      for (let run = 0; run < 10; run++) {
        const start = performance.now();
        const fields = detectSensitiveFields(fixture.fields).map((f, i) => ({ ...f, rect: fixture.fields[i].rect }));
        await redactScreenshot('data:image/png;base64,AA==', fields, fixture.viewport);
        runs.push(performance.now() - start);
      }
      results.push({ id: fixture.id, ...scoreRedaction(fixture.truth.filter((b) => b.sensitive), fixture.truth.filter((b) => !b.sensitive), masks) });
    }
  } finally { Object.assign(globalThis, previous); }
  const totals = Object.fromEntries(['expected', 'masks', 'correct', 'missed', 'unnecessary', 'safeRegions', 'safeDamaged'].map((key) => [key, results.reduce((sum, r) => sum + r[key], 0)]));
  return { quality: { method: 'Actual detector + redactScreenshot final mask commands; Canvas adapter, not native pixels',
    samples: cases.length, iouThreshold: 0.5, ...totals,
    precision: totals.correct / totals.masks, recall: totals.correct / totals.expected,
    safePreservation: (totals.safeRegions - totals.safeDamaged) / totals.safeRegions, results },
    performance: { method: 'Node Canvas-command adapter, detection + redaction; NOT browser latency', runsMs: runs, ...statistics(runs) } };
}
