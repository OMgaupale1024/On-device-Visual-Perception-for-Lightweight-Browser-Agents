export const ENGINE = 'browser-local-ocr';
export const ENGINE_VERSION = '6.0.1';
export const OCR_TIMEOUT_MS = 45_000;
export const HOST_PATH = 'src/perception/offscreen.html';
export const OCR_MESSAGE = 'EDGESIGHT_LOCAL_OCR';

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
