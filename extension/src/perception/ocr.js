import { createWorker } from '../../vendor/ocr/tesseract.esm.min.js';
import { localOptions } from './config.js';
import { clearWorkerImage } from './cleanup.js';

// PIXELS ONLY. No observed DOM, field metadata, labels, hints or fallback text input.
// Hosted in an offscreen extension page; all engine URLs resolve to this extension.
let worker;
export async function recognizePixels(image) {
  if (!image || typeof image.dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl) ||
      !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
      image.width <= 0 || image.height <= 0 || image.width * image.height > 20_000_000) {
    throw new Error('Unsupported OCR image.');
  }
  const start = performance.now();
  const cold = !worker;
  if (!worker) {
    worker = await createWorker('eng', 1, localOptions(new URL('../../', import.meta.url).href));
    // Sparse text handles separated form labels/values. This is layout policy, no text hints.
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
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
  } catch {
    await disposeEngine();
    throw new Error('Local OCR processing unavailable.');
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
