// Actual Tesseract/WASM inference under NODE, not browser/MV3 proof.
// Input must be a locally generated synthetic sanitized fixture, never a real screenshot.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWorker } from 'tesseract.js';
import { sanitizeVisual } from '../extension/src/privacy/visual.js';
const filename = process.argv[2];
if (!filename) throw new Error('Supply a local synthetic PNG fixture.');
const image = await readFile(filename);
const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
const demo = await readFile('demo-page/index.html', 'utf8');
const secrets = ['employeeName', 'email', 'phone', 'employeeId', 'password'].map((id) => demo.match(new RegExp(`<input id="${id}"[^>]*value="([^"]*)"`))[1]);
const started = performance.now();
const worker = await createWorker('eng', 1, {
  langPath: resolve('extension/vendor/ocr/lang'), cacheMethod: 'none', gzip: true,
  logger: () => {}, errorHandler: () => {},
});
await worker.setParameters({ tessedit_pageseg_mode: '11' });
const initializationMs = performance.now() - started;
try {
  for (let run = 0; run < 2; run++) {
    const start = performance.now();
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    const inferenceMs = performance.now() - start;
    const result = sanitizeVisual({ data, width, height, timing: {
      cold: run === 0, initializationMs: run === 0 ? initializationMs : 0,
      inferenceMs, totalMs: inferenceMs + (run === 0 ? initializationMs : 0),
    } }, secrets);
    if (result.privacy !== 'SAFE') throw new Error('Real engine output blocked or malformed.');
    const text = result.value.items.map((item) => item.text).join(' ');
    if (!['Destination', 'Bengaluru', 'Purpose', 'Conference', 'Continue'].every((word) => text.includes(word))) throw new Error('Actual OCR missed required synthetic strings.');
    console.log(JSON.stringify({ environment: 'Node WASM synthetic fixture, NOT Chrome', ...result }, null, 2));
  }
} finally { await worker.terminate(); secrets.fill(''); }
