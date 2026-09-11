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

// Second, bounded PIXEL OCR pass for actionable control regions that the full-screen
// sparse pass read with low confidence (e.g. a styled "Continue" button). Crops the
// ALREADY-CAPTURED screenshot, upscales + greyscales + auto-inverts dark-on-dark, then
// re-recognises as a single line. Pixels only; no DOM text, no new network, no new model.
export async function refineRegions(image, regions) {
  if (!worker || !Array.isArray(regions) || !regions.length ||
      !image || typeof image.dataUrl !== 'string' ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl)) return [];
  let bitmap;
  try {
    // Decode the already-captured PNG locally (no network, no fetch): base64 -> bytes -> blob.
    const png = Uint8Array.from(atob(image.dataUrl.slice(22)), (c) => c.charCodeAt(0));
    bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    await worker.setParameters({ tessedit_pageseg_mode: '7' }); // one centred label line
    const out = [];
    for (const region of regions) {
      const refined = await bestCropRead(bitmap, region?.bbox);
      if (refined) out.push({ id: region.id, text: refined.text, confidence: refined.confidence });
    }
    return out;
  } catch (err) {
    logError('offscreen', sanitizeError('OCR_REFINE', err));
    return [];
  } finally {
    try { await worker?.setParameters({ tessedit_pageseg_mode: '11' }); } catch { /* restore global layout */ }
    bitmap?.close?.();
  }
}

const REFINE_SCALE = 4;
// Generic centred-text crop variants for a button-like control, as fractions of the
// element bbox (never tuned to specific label text), each greyscaled+auto-inverted and
// optionally binarised. Full crop can include dark padding that clips glyphs; a centred
// inset isolates the label. Best-confidence pixel read wins.
const CROP_VARIANTS = [
  { name: 'full', ix: 0.00, iy: 0.00, threshold: false },
  { name: 'center', ix: 0.10, iy: 0.15, threshold: false },
  { name: 'center-bin', ix: 0.10, iy: 0.15, threshold: true },
  { name: 'tight-bin', ix: 0.20, iy: 0.20, threshold: true },
];

async function bestCropRead(bitmap, bbox) {
  if (!bbox || ![bbox.x, bbox.y, bbox.width, bbox.height].every(Number.isFinite) ||
      bbox.width <= 0 || bbox.height <= 0) return null;
  let best = null;
  for (const variant of CROP_VARIANTS) {
    const read = await recognizeCropVariant(bitmap, bbox, variant);
    if (!read) continue;
    if (read.text && typeof read.confidence === 'number' && (!best || read.confidence > best.confidence)) best = read;
  }
  return best;
}

async function recognizeCropVariant(bitmap, bbox, variant) {
  const pad = 6;
  const insetX = bbox.width * variant.ix, insetY = bbox.height * variant.iy;
  const sx = Math.max(0, Math.floor(bbox.x + insetX - pad));
  const sy = Math.max(0, Math.floor(bbox.y + insetY - pad));
  const sw = Math.min(bitmap.width - sx, Math.ceil(bbox.width - 2 * insetX + pad * 2));
  const sh = Math.min(bitmap.height - sy, Math.ceil(bbox.height - 2 * insetY + pad * 2));
  if (sw <= 0 || sh <= 0) return null;
  const canvas = new OffscreenCanvas(Math.round(sw * REFINE_SCALE), Math.round(sh * REFINE_SCALE));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data; let sum = 0;
  for (let i = 0; i < d.length; i += 4) { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = g; sum += g; }
  // Tesseract favours dark text on light: invert when the crop is mostly dark (a filled
  // button). Principled from pixel luminance — not tuned to any specific label text.
  if (sum / (d.length / 4) < 128) for (let i = 0; i < d.length; i += 4) { const v = 255 - d[i]; d[i] = d[i + 1] = d[i + 2] = v; }
  if (variant.threshold) for (let i = 0; i < d.length; i += 4) { const v = d[i] < 128 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  try {
    const { data } = await worker.recognize(bytes, {}, { text: true });
    const text = (data?.text || '').replace(/\s+/g, ' ').trim();
    const confidence = typeof data?.confidence === 'number' && data.confidence >= 0 && data.confidence <= 100 ? data.confidence / 100 : null;
    return { text, confidence };
  } finally { bytes.fill(0); }
}

export async function disposeEngine() {
  const previous = worker;
  worker = undefined;
  await previous?.terminate();
}
