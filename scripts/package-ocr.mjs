import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Deliberate allowlist, inspected against the pinned packages. No runtime downloads.
const packages = { 'tesseract.js': '6.0.1', 'tesseract.js-core': '6.1.2', '@tesseract.js-data/eng': '1.0.0' };
for (const [name, version] of Object.entries(packages)) {
  const installed = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  if (installed.version !== version) throw new Error(`Unexpected version: ${name}`);
}
const files = [
  ['tesseract.js/dist/tesseract.esm.min.js', 'tesseract.esm.min.js'],
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
  ['tesseract.js/LICENSE.md', 'licenses/tesseract-js.txt'],
  ['tesseract.js-core/LICENSE', 'licenses/tesseract-core.txt'],
  ['tesseract.js/dist/tesseract.min.js.LICENSE.txt', 'licenses/runtime-notices.txt'],
  ['tesseract.js/dist/worker.min.js.LICENSE.txt', 'licenses/worker-notices.txt'],
];
// Include complete licenses of bundled JS dependencies as well as upstream notices.
for (const name of ['bmp-js', 'idb-keyval', 'is-url', 'regenerator-runtime', 'wasm-feature-detect', 'zlibjs']) {
  const { readdir } = await import('node:fs/promises');
  const license = (await readdir(`node_modules/${name}`)).find((f) => /^licen[sc]e(?:[.-]|$)/i.test(f));
  if (!license) throw new Error(`Missing license: ${name}`);
  files.push([`${name}/${license}`, `licenses/${name}.txt`]);
}
const assets = [];
for (const [source, destination] of files) {
  const target = `extension/vendor/ocr/${destination}`;
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  await copyFile(`node_modules/${source}`, target);
  const bytes = await readFile(target);
  assets.push({ path: destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
for (const name of ['buffer', 'ieee754', 'tessdata']) {
  const bytes = await readFile(`scripts/licenses/${name}.txt`);
  const path = `licenses/${name}.txt`;
  await writeFile(`extension/vendor/ocr/${path}`, bytes);
  assets.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile('extension/vendor/ocr/assets.json', JSON.stringify({ packages, assets }, null, 2) + '\n');
console.log(`Packaged ${assets.length} OCR assets/licenses (${assets.reduce((sum, f) => sum + f.bytes, 0)} bytes).`);
