// Scan tracked and non-ignored working files. Report locations, never matched values.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const files = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' }).split('\0').filter(Boolean));
const patterns = [
  /nvapi-[A-Za-z0-9_-]{24,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{40,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  // Token boundaries avoid accidental matches inside embedded WASM/base64 assets.
  /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/,
];
const findings = [];
let checked = 0;
for (const file of files) {
  let bytes;
  try { if (!statSync(file).isFile()) continue; bytes = readFileSync(file); }
  catch { continue; } // A tracked deletion has no working contents.
  if (bytes.includes(0)) continue;
  checked++;
  if (patterns.some(pattern => pattern.test(bytes.toString('utf8')))) findings.push(file);
}
if (findings.length) {
  console.error('Secret-pattern scan requires review in: ' + findings.join(', '));
  process.exitCode = 1;
} else console.log(`Secret-pattern scan passed: ${checked} text files, no credential patterns found.`);
