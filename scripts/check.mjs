import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
for (const root of ['extension/src', 'extension/tests', 'scripts']) {
  for (const file of await readdir(root, { recursive: true })) {
    if (!/\.m?js$/.test(file)) continue;
    if (spawnSync(process.execPath, ['--check', `${root}/${file}`], { stdio: 'inherit' }).status !== 0) process.exit(1);
  }
}
const inventory = JSON.parse(await readFile('extension/vendor/ocr/assets.json', 'utf8'));
for (const asset of inventory.assets) {
  const bytes = await readFile(`extension/vendor/ocr/${asset.path}`);
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error('OCR asset integrity check failed.');
  }
}
JSON.parse(await readFile('extension/manifest.json', 'utf8'));
console.log('Syntax, manifest and packaged OCR asset integrity checks passed.');
