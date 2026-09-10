// The vendored Tesseract.js 6.0.1 browser bundle exposes ONLY a default export
// (`export { tesseract_min as default }`); createWorker is a property of it, not a
// named export. A named import throws "does not provide an export named createWorker"
// during Chrome's ESM linking, before any code runs. See ocr-import.test.mjs.
import Tesseract from '../../vendor/ocr/tesseract.esm.min.js';
const { createWorker } = Tesseract;
import { localOptions } from './config.js';
import { clearWorkerImage } from './cleanup.js';
import { sanitizeError, logError, logStage } from './diagnostics.js';

// PIXELS ONLY. No observed DOM, field metadata, labels, hints or fallback text input.
// Hosted in an offscreen extension page; all engine URLs resolve to this extension.
let worker;

// Map Tesseract's own progress status to the stage taxonomy so a Chrome failure
// points at core vs language vs recognition. Status text carries no page content.
function statusStage(status) {
  const s = String(status || '');
  if (s.includes('core')) return 'OCR_CORE_LOAD';
  if (s.includes('language') || s.includes('traineddata')) return 'OCR_LANGUAGE_LOAD';
  if (s.includes('initiali')) return 'OCR_INIT';
  if (s.includes('recogniz')) return 'OCR_RECOGNIZE';
  return 'OCR_PROGRESS';
}
export async function recognizePixels(image) {
  if (!image || typeof image.dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl) ||
      !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
      image.width <= 0 || image.height <= 0 || image.width * image.height > 20_000_000) {
    throw new Error('Unsupported OCR image.');
  }
  const start = performance.now();
  const cold = !worker;
  if (!worker) {
    let last;
    try {
      logStage('offscreen', 'OCR_WORKER_CREATE', cold ? 'cold start' : '');
      worker = await createWorker('eng', 1, {
        ...localOptions(new URL('../../', import.meta.url).href),
        logging: true,
        // Log each engine sub-stage once (core -> language -> init -> recognize)
        // so a failed cold start reveals exactly which packaged asset broke.
        logger: (m) => { const st = statusStage(m?.status); if (st !== last) { last = st; logStage('offscreen', st, m?.status); } },
        errorHandler: (e) => logError('offscreen', sanitizeError('OCR_WORKER_ERROR', e)),
      });
      // Sparse text handles separated form labels/values. This is layout policy, no text hints.
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
    } catch (err) {
      const diag = sanitizeError('OCR_WORKER_CREATE', err);
      logError('offscreen', diag);
      await disposeEngine();
      throw Object.assign(new Error(diag.message), { stage: diag.stage, name: diag.name });
    }
  }
  const initialized = performance.now();
  const bytes = Uint8Array.from(atob(image.dataUrl.slice(22)), (c) => c.charCodeAt(0));
  try {
    const { data } = await worker.recognize(bytes, {}, { text: true, blocks: true });
    const finished = performance.now();
    await clearWorkerImage(worker);
    const cleared = performance.now();
    // Raw OCR data stays in trusted extension memory pending the output privacy guard.
    return { data, width: image.width, height: image.height,
      timing: { cold, initializationMs: initialized - start, inferenceMs: finished - initialized,
        cleanupMs: cleared - finished, totalMs: cleared - start } };
  } catch (err) {
    // Preserve the real recognition failure (error class + short message) for the
    // offscreen console; the recognizer produced no text, so this leaks no page data.
    const diag = sanitizeError('OCR_RECOGNIZE', err);
    logError('offscreen', diag);
    await disposeEngine();
    throw Object.assign(new Error(diag.message), { stage: diag.stage, name: diag.name });
  } finally {
    bytes.fill(0);
    image = null;
  }
}

export async function disposeEngine() {
  const previous = worker;
  worker = undefined;
  await previous?.terminate();
}
