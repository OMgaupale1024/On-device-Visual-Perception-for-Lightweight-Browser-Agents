// Controlled prototype benchmark. Pixel prediction uses actual packaged OCR, never DOM.
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { createWorker } from 'tesseract.js';
import { sanitizeVisual } from '../extension/src/privacy/visual.js';
import { clearWorkerImage } from '../extension/src/perception/cleanup.js';
import { detectSensitiveFields } from '../extension/src/privacy/detect.js';
import { buildSafeAgentContext } from '../extension/src/privacy/agent-context.js';
import { plannerInput, SECRETS } from '../extension/tests/planner-fixture.mjs';
import { SIH_WEIGHTS, scoreVisual, scoreLabels, statistics, utf8Bytes } from '../extension/src/metrics/metrics.js';
import { benchmarkRedaction } from './benchmark-redaction.mjs';
import { renderMetricTable } from './benchmark-table.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(root);
const output = 'benchmarks/output';
await mkdir(output, { recursive: true });
const readJson = async (path) => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const dataset = await readJson('benchmarks/fixtures/screens.json');
const rendered = await readJson('benchmarks/fixtures/rendered.json');
const pii = await readJson('benchmarks/fixtures/pii.json');
const secrets = ['Example Tester', 'fixture@example.invalid', '5550101234', 'EMP1024', 'fake-secret'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sourceFiles = ['package.json', 'package-lock.json', 'extension/manifest.json', 'extension/tests/planner-fixture.mjs'];
for (const directory of ['extension/src', 'server/app', 'benchmarks/fixtures', 'scripts']) {
  for (const path of await readdir(directory, { recursive: true })) {
    if (!/\.(js|mjs|py|ps1|json|png)$/.test(path)) continue;
    sourceFiles.push(directory + '/' + path.replaceAll('\\', '/'));
  }
}
const sourceHash = createHash('sha256');
for (const path of sourceFiles.sort()) { sourceHash.update(path + '\0'); sourceHash.update(await readFile(path)); }
const result = { benchmarkVersion: 1, label: 'controlled prototype benchmark', measuredAt: new Date().toISOString(),
  code: { revision: git('rev-parse', 'HEAD'), dirty: Boolean(git('status', '--porcelain')), sourceSha256: sourceHash.digest('hex'), sourceFiles },
  officialWeights: SIH_WEIGHTS,
  environment: { scope: 'Measured on this prototype environment', os: `${os.type()} ${os.release()} ${os.arch()}`,
    node: process.version, cpu: os.cpus()[0]?.model || null, logicalCpus: os.cpus().length,
    browser: null, browserReason: 'Node/WASM benchmark; no Chrome measurement', gpu: null,
    ocr: 'Tesseract.js 6.0.1 / core 6.1.2 / English packaged data / PSM 11' },
  visualContext: { samples: [], normalization: 'NFKC/lowercase/trim/collapse whitespace/punctuation spacing; exact line items; one-to-one; no fuzzy or line joining' },
  piiDetection: null, redaction: null, resources: {}, latency: {} };
const newWorker = () => createWorker('eng', 1, { langPath: resolve('extension/vendor/ocr/lang'),
  cacheMethod: 'none', gzip: true, logger: () => {}, errorHandler: () => {} });
async function recognize(worker, sample) {
  const image = await readFile(`benchmarks/fixtures/${sample.id}.png`);
  const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
  if (width !== sample.width || height !== sample.height) throw Error('Fixture dimensions changed');
  const start = performance.now();
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const inferenceMs = performance.now() - start;
  const cleanupStart = performance.now(); await clearWorkerImage(worker);
  const cleanupMs = performance.now() - cleanupStart;
  const privacyStart = performance.now();
  const safe = sanitizeVisual({ data, width, height, timing: { cold: false, initializationMs: 0,
    inferenceMs, cleanupMs, totalMs: inferenceMs + cleanupMs } }, secrets,
  rendered.samples.find((s) => s.id === sample.id).sensitiveRegions);
  const privacyMs = performance.now() - privacyStart;
  // An OCR/privacy failure counts as no predictions for quality; retain fixed status.
  const quality = scoreVisual(sample.text, { source: 'local-pixel-ocr', items: (safe.value?.items || []).map((v) => ({ text: v.text, source: 'visual' })) });
  return { quality, status: safe.status, inferenceMs, cleanupMs, privacyMs,
    sha256: createHash('sha256').update(image).digest('hex') };
}
let worker = await newWorker();
try {
  await worker.setParameters({ tessedit_pageseg_mode: '11' });
  for (const sample of dataset.samples) {
    const measured = await recognize(worker, sample);
    result.visualContext.samples.push({ id: sample.id, width: sample.width, height: sample.height,
      sha256: measured.sha256, status: measured.status, ...measured.quality });
  }
} finally { await worker.terminate(); }
const totals = Object.fromEntries(['expected', 'correct', 'missed', 'unexpected'].map((key) => [key, result.visualContext.samples.reduce((sum, s) => sum + s[key], 0)]));
Object.assign(result.visualContext, { sampleCount: dataset.samples.length, ...totals,
  accuracy: totals.correct / totals.expected, precision: totals.correct / (totals.correct + totals.unexpected) });

const cold = [], initialization = [], warm = [], filter = [];
for (let run = 0; run < 2; run++) {
  const start = performance.now(); worker = await newWorker();
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    initialization.push(performance.now() - start);
    await recognize(worker, dataset.samples[0]); cold.push(performance.now() - start);
    if (run === 1) for (let n = 0; n < 5; n++) {
      const measured = await recognize(worker, dataset.samples[0]); warm.push(measured.inferenceMs); filter.push(measured.privacyMs);
    }
  } finally { await worker.terminate(); }
}
const measuredSet = (runsMs, method) => ({ method, runsMs, ...statistics(runsMs) });
result.resources.ocrCold = measuredSet(cold, 'New worker initialization + fixture read + inference + cleanup + local filtering');
result.resources.ocrInitialization = measuredSet(initialization, 'New worker + PSM configuration');
result.resources.ocrWarmInference = measuredSet(warm, 'Reused second cold worker; fixed filled PNG; recognition only');
result.resources.visualPrivacy = measuredSet(filter, 'Node actual sanitizeVisual on warm OCR');
const detection = [], contextRuns = [];
let predicted, agent;
for (let run = 0; run < 10; run++) {
  let start = performance.now(); predicted = detectSensitiveFields(pii.rows.map((r) => ({ id: r.id, ...r.signal })));
  detection.push(performance.now() - start);
  const input = plannerInput(); start = performance.now(); agent = buildSafeAgentContext(input);
  contextRuns.push(performance.now() - start);
  if (agent.status !== 'READY') throw Error('Controlled context blocked');
}
result.piiDetection = { ...scoreLabels(pii.rows.map((r) => r.expected), predicted.map((r) => r.role), pii.roles),
  method: 'Actual Phase 2 field-signal detector, not arbitrary pixel PII',
  errors: pii.rows.flatMap((r, i) => r.expected === predicted[i].role ? [] : [{ id: r.id, expected: r.expected, predicted: predicted[i].role }]) };
result.resources.detection = measuredSet(detection, 'Node actual detector on all 40 signals');
result.resources.contextConstruction = measuredSet(contextRuns, 'Node actual builder + final guard on fixed safe planning fixture');
const redaction = await benchmarkRedaction(pii.rows);
result.redaction = redaction.quality; result.resources.redactionCommands = redaction.performance;
const assetFiles = (await readdir('extension/vendor/ocr', { recursive: true })).filter((p) => !p.endsWith('assets.json'));
const assets = [];
for (const path of assetFiles) { const info = await stat('extension/vendor/ocr/' + path); if (info.isFile()) assets.push({ file: path.replaceAll('\\', '/'), bytes: info.size }); }
result.resources.localPerceptionAssets = { method: 'On-disk files, not runtime RAM', files: assets, bytes: assets.reduce((s, f) => s + f.bytes, 0) };
let extensionBytes = 0;
for (const path of await readdir('extension', { recursive: true })) { const info = await stat('extension/' + path); if (info.isFile()) extensionBytes += info.size; }
result.resources.extensionDirectoryBytes = extensionBytes;
result.resources.memory = { status: 'NOT_MEASURED', method: 'Browser memory percentage requires manual Chrome measurement' };
result.resources.cpuGpuUtilization = { status: 'NOT_MEASURED' };
const body = JSON.stringify(agent.context);
result.resources.safeContextBytes = utf8Bytes(body);
await writeFile(`${output}/safe-context.json`, body);
const python = process.platform === 'win32' ? 'server/.venv/Scripts/python.exe' : 'server/.venv/bin/python';
const server = JSON.parse(execFileSync(python, ['scripts/benchmark-server.py', '--context', `${output}/safe-context.json`,
  ...(process.argv.includes('--ai') ? ['--ai'] : [])], { encoding: 'utf8', timeout: 120000, windowsHide: true }));
if (server.status === 'ERROR') throw Error('Server benchmark failed');
result.environment.python = server.python;
result.resources.providerInputBytes = server.providerInputBytes;
result.resources.serverRequestBytes = server.requestBytes;
result.latency = { serverValidation: measuredSet(server.validationMs, 'Python actual Pydantic validation, fixed fixture'),
  deterministicPlanner: measuredSet(server.deterministicPlannerMs, 'Python actual deterministic plan() only'),
  providerProjection: measuredSet(server.projectionMs, 'Python actual prepare_ai_input, no provider call'),
  deterministicHttp: { ...measuredSet(server.http.deterministic.runsMs, 'urllib -> loopback FastAPI /plan -> validated response; not Chrome plan latency'), statuses: server.http.deterministic.statuses },
  nvidia: server.nvidia, chromePlan: { status: 'PENDING' }, chromePostExecution: { status: 'PENDING' },
  chromeMachineTotal: { status: 'PENDING', reason: 'Do not sum mixed runtime benchmarks into an end-to-end claim' } };
if (server.nvidia.status === 'MEASURED') Object.assign(result.latency.nvidia, statistics(server.nvidia.runsMs));
// Output contains fixed metadata/counts only; no recognized text, field values or images.
const json = JSON.stringify(result, null, 2) + '\n';
for (const secret of [...secrets, ...SECRETS]) if (json.includes(secret)) throw Error('Benchmark output privacy blocked');
await writeFile(`${output}/results.json`, json);
const table = renderMetricTable(result); await writeFile(`${output}/table.md`, table);
console.log('EdgeSight SIH controlled prototype benchmark\n' + table + `\nJSON: ${output}/results.json`);
