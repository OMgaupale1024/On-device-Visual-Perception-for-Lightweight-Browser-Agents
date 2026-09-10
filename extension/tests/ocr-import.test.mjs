import test from 'node:test';
import assert from 'node:assert/strict';

// Regression guard for the Chrome failure:
//   Uncaught SyntaxError: The requested module '.../tesseract.esm.min.js'
//   does not provide an export named 'createWorker'
//
// That was an ESM *linking* error (resolved before any code runs) against the
// vendored browser bundle, which exports ONLY a default. Prior Node tests missed it:
// perception.test.mjs reads ocr.js as text, and smoke-ocr.mjs imports createWorker
// from the 'tesseract.js' PACKAGE (the Node build, which does have a named export) —
// neither ever links the vendored browser bundle the way Chrome does.
//
// Linking is spec-defined and environment-independent, so Node reproduces it. The
// bundle references `self` at evaluation time (a browser global), so we shim it to
// inspect the evaluated export object. LIMIT: this proves the import/export CONTRACT,
// not full Chrome runtime (WASM/worker) execution — the user still smoke-tests Chrome.
globalThis.self ??= globalThis;

const bundleUrl = new URL('../vendor/ocr/tesseract.esm.min.js', import.meta.url).href;
const ocrUrl = new URL('../src/perception/ocr.js', import.meta.url).href;

test('vendored Tesseract bundle exposes createWorker only via its default export', async () => {
  const bundle = await import(bundleUrl);
  assert.deepEqual(Object.keys(bundle), ['default'], 'bundle must export only a default');
  assert.equal(typeof bundle.default, 'object', 'default export is the Tesseract namespace object');
  assert.equal(typeof bundle.default.createWorker, 'function', 'createWorker must be callable on the default export');
  assert.equal(bundle.createWorker, undefined, 'no NAMED createWorker export exists — a named import throws in Chrome');
});

test('ocr.js links the bundle without the "export named createWorker" SyntaxError', async () => {
  let err;
  try {
    await import(ocrUrl);
  } catch (e) {
    err = e;
  }
  // Linking precedes evaluation, so a wrong import form throws SyntaxError here even
  // with the `self` shim in place. Any other error class is outside this contract.
  assert.ok(
    !(err instanceof SyntaxError && /does not provide an export named/.test(err.message)),
    `ocr.js OCR import contract regressed: ${err && err.message}`,
  );
});
