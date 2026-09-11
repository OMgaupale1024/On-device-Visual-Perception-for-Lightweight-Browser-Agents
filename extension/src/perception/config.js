export const ENGINE = 'browser-local-ocr';
export const ENGINE_VERSION = '6.0.1';
export const OCR_TIMEOUT_MS = 45_000;
export const HOST_PATH = 'src/perception/offscreen.html';
export const OCR_MESSAGE = 'EDGESIGHT_LOCAL_OCR';
export const OCR_REFINE_MESSAGE = 'EDGESIGHT_LOCAL_OCR_REFINE';
// Actionable controls whose full-screen OCR confidence is below this get one extra
// local crop-OCR pass; a replacement must clear REFINE_MIN_CONFIDENCE and beat the
// original by REFINE_MIN_GAIN. Pixel-only; never uses DOM text.
export const REFINE_CONF_THRESHOLD = 0.75;
export const REFINE_MIN_CONFIDENCE = 0.6;
export const REFINE_MIN_GAIN = 0.15;

export function localOptions(base) {
  const url = new URL(base);
  if (url.protocol !== 'chrome-extension:') throw new Error('Extension-local OCR assets required.');
  return {
    workerPath: new URL('vendor/ocr/worker.min.js', url).href,
    corePath: new URL('vendor/ocr/core/', url).href,
    langPath: new URL('vendor/ocr/lang/', url).href,
    workerBlobURL: false,
    legacyCore: false,
    legacyLang: false,
    cacheMethod: 'none',
    gzip: true,
    logging: false,
    logger: () => {},
    errorHandler: () => {},
  };
}
