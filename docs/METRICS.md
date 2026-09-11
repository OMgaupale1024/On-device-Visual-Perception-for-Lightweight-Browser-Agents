# EdgeSight SIH evaluation metrics

**Phase 9 code complete; real Chrome timing acceptance PENDING.** These are a
**controlled prototype benchmark**, measured on this prototype environment, not
general accuracy or a claim about every browser/machine. Passing tests establishes
implementation correctness; it does not establish recognition or privacy accuracy.

## Official criterion mapping

| SIH criterion | Weight | Measurement implemented |
|---|---:|---|
| Accuracy of visual context from screen | 25% | Exact safe text-item detection from synthetic PNG pixel OCR |
| Sensitive/PII detection recall/precision | 20% | Actual Phase 2 field-signal classifier on independent labels |
| Precision of redaction | 20% | Actual final mask commands against labeled regions |
| Client-side resource utilization | 20% | Cold/warm OCR, local stage times, bytes; manual CPU/memory procedure |
| Overall end-to-end task latency | 15% | Live plan/execute timing hooks; independent local HTTP benchmark |

Weights follow the requested SIH criteria. No combined weighted score is calculated:
the weights do not define how bytes, durations and quality ratios become scores.
Asset footprint and stage duration are resource proxies, not CPU/GPU/RAM usage.

## Reproduce on Windows

From repository root, with Node dependencies and the server venv installed:

```powershell
npm ci
py -3.10 -m venv server/.venv
server/.venv/Scripts/python.exe -m pip install -r server/requirements-dev.txt
npm run test:metrics
npm run benchmark
```

An existing venv can be reused; no separate running server is needed. The CLI starts
and stops its own loopback FastAPI process on an available port. Default mode makes
10 deterministic HTTP requests and **zero provider requests**. Optional
`npm run benchmark -- --ai` makes three real AI requests only when NVIDIA_API_KEY
is configured privately in the server environment; see server/README.md for masked
key entry. No key was available here, so NVIDIA latency remains PENDING.

Output: ignored benchmarks/output/results.json and table.md; the intermediate
safe-context.json is also ignored. The reviewed committed reference is
[results.json](../benchmarks/reference/results.json) and
[judge table](../benchmarks/reference/table.md). Every run replaces ignored output,
not the reference. Review a whole run before deliberately updating the reference;
never select just its fastest samples. All successful protocol samples and HTTP
failures are retained, including the slow HTTP outliers in this run.

Five small synthetic PNGs and separate labels are committed in benchmarks/fixtures.
To regenerate intentionally (Windows System.Drawing, Arial font):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-benchmark-fixtures.ps1
```

Generator uses only fake data, no user screen. Font/platform changes may change PNG
hashes and OCR results; use the committed PNGs to reproduce the reference inputs.
JSON records each PNG SHA-256, dimensions, all sample results, source-file SHA-256,
Git revision/dirty state, environment, method and raw numeric timing arrays.
The reference was measured at 2026-09-11T00:10:52.714Z before this commit, on baseline
6b8172b5b432b4d8afed6f6d493d6c10b91337ef, with dirty=true. Its source digest is
83488bd4880c8fd175d2306281791ef994ab1fff763b074e1e6184d3d022883a. The enumerated source files identify the implementation
measured; docs/reference output are excluded to avoid a self-referential hash.
The digest covers exact working-file bytes, including text line endings. Git's LF
normalization can change a generated JSON file's byte hash on checkout without
changing its labels. PNG hashes identify the exact recognition inputs independently.

## Dataset and quality definitions

Visual: **5 screens, 41 expected safe line items**. Filled travel form (11), one
missing-purpose form (11), submitted page (2), filled form at 75% scale (11), and
neutral screen with multiple button labels (6). Dimensions respectively 1000x760,
1000x760, 1000x400, 750x570, 1000x500. These are clean generated text layouts, not
browser screenshots or an independent arbitrary-site corpus. The last fixture tests
text recognition, not button detection. Repeated layouts/items are correlated.

Prediction executes actual Tesseract.js/WASM recognition, then the existing
sanitizeVisual normalization/privacy filter. Known fake secrets and labeled private
regions are supplied to that filter to isolate safe OCR evaluation; the visual score
does not evaluate discovery of those regions. Ground-truth expected text is used only
by scoring. No DOM, planner response or expected label is used as a prediction.
Scorer requires local-pixel-ocr provenance and source=visual items. It is a benchmark
interface, not a cryptographic provenance boundary.

Normalization: Unicode NFKC, lowercase, trim, collapse whitespace, normalize spacing
around . , ! ? ; :. Punctuation is retained. Exact whole-line one-to-one matching;
no fuzzy spelling, substring acceptance, or joined lines. Duplicate predictions are
unexpected items once an expected item is consumed. This is deliberately distinct
from Phase 8's spatially adjacent phrase matcher. Accuracy = correct / expected;
precision = correct / (correct + unexpected). Missed = expected - correct.
Actual result: **41 correct, 0 missed, 0 unexpected, 100% item accuracy** on these five
synthetic samples only. Confidence thresholds were not tuned; this dataset cannot
justify general threshold calibration.

PII: **40 labeled structural candidates: 20 sensitive, 20 safe**, four positives for
each of NAME, EMAIL, PHONE, EMPLOYEE_ID, PASSWORD. Inputs go through the real
detectSensitiveFields detector. Safe negatives include destination/purpose/buttons
and misleading labels such as Email template and Phone model. Unsupported aliases
(Traveller, Correspondence address, Reach me, Staff code, Access secret) expose five
false negatives. Six misleading safe labels expose false positives; none are hidden
or fixed to improve this benchmark. This measures field-signal classification, not
arbitrary PII discovery from pixels or a balanced real-world population estimate.

Overall **TP=15, FP=6, FN=5, TN=14**. Precision = TP/(TP+FP); recall = TP/(TP+FN);
F1 = 2TP/(2TP+FP+FN). Per-category is one-vs-rest; overall is sensitive-vs-safe.
Zero denominators are null (not measured), never an invented 100%.

| Category | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|
| NAME | 3 | 1 | 1 | 75% | 75% | 75% |
| EMAIL | 3 | 1 | 1 | 75% | 75% | 75% |
| PHONE | 3 | 2 | 1 | 60% | 75% | 66.67% |
| EMPLOYEE_ID | 3 | 1 | 1 | 75% | 75% | 75% |
| PASSWORD | 3 | 1 | 1 | 75% | 75% | 75% |

Redaction: **3 region layouts, 41 sensitive and 41 safe regions**: the same 40
candidates at scale 1 and 1.25, plus a fractional/clipped geometry case. These are
repeated geometry conditions, not 82 independent examples. The real detector and
redactScreenshot run through a lightweight Canvas adapter that records final black
fillRect commands after the preview pass. Ground-truth boxes are calculated
independently of the production geometry function. Matching greedily assigns pairs
by descending IoU, deterministic tie order, one-to-one at **IoU >=0.5**. Half-overlap
is a coarse localization criterion allowing rounding/padding; it does not prove all
sensitive pixels are covered. Any positive overlap damages a labeled safe region.

43 masks: **31 correct, 10 missed sensitive regions, 12 unnecessary masks**;
12 of 41 safe regions damaged. Precision = correct/masks; recall = correct/expected;
safe preservation = (safe regions - damaged)/safe regions. This is command/region
evaluation, **not native Chrome pixel-opacity testing**. The adapter does not perform
PNG encoding, GPU rendering or actual image decode; its latency is not browser
redaction latency. Unit tests separately expose partial overlap, duplicate masks,
misses, unnecessary masks and empty sets.

## Judge-facing reference table

| Metric | Method | Samples | Measured result | Limitation |
|---|---|---|---|---|
| Visual-context accuracy | Exact safe pixel-OCR line items | 5 screens / 41 items | 100.00% | Five synthetic layouts only |
| PII precision | Actual field-signal detector | 40 | 71.43% | Not general PII in pixels |
| PII recall | Actual field-signal detector | 40 | 75.00% | Not general PII in pixels |
| PII f1 | Actual field-signal detector | 40 | 73.17% | Not general PII in pixels |
| Redaction precision | Final mask commands; IoU >=0.5 | 43 masks | 72.09% | Canvas adapter, not Chrome pixels |
| Redaction recall | One-to-one region matching | 41 sensitive regions | 75.61% | Coarse region coverage |
| Safe-content preservation | No positive mask overlap | 41 safe regions | 70.73% | Labeled regions only |
| OCR cold latency | New-worker total, median | 2 | 523.908 ms | Node/WASM, includes fixture read/filter |
| OCR warm latency | Recognition only, median | 5 | 249.229 ms | Fixed filled fixture; Node/WASM |
| Structured payload size | Current builder JSON UTF-8 | 1 | 1553 bytes | Fixed safe planning fixture |
| Provider input size | Actual Python projection UTF-8 | 1 | 1058 bytes | User content, excludes system prompt/envelope |
| Local OCR asset footprint | On-disk file sum | 19 files | 11092523 bytes | Not runtime RAM |
| Deterministic HTTP latency | Loopback request/response median | 10 | 1.904 ms | Not full plan latency; failures included |
| Plan latency | Chrome Analyze/Plan | 0 | Pending | Current-run instrumentation; manual run pending |
| Post-execution verification latency | Chrome Execute to result | 0 | Pending | Includes stabilization; manual run pending |
| Full machine-pipeline latency | Plan plus Execute/result, no human delay | 0 | Pending | Never synthesized from mixed benchmarks |


## Runtime measurements, separately from quality

Environment: Windows_NT 10.0.26200 x64; AMD Ryzen 9 5900HX with Radeon Graphics,
16 logical CPUs; Node v24.11.0; Python
3.10.11; Tesseract.js 6.0.1 / core 6.1.2 / English packaged data / PSM 11. Node uses the installed pinned
Tesseract runtime and packaged English data. Browser version/GPU measurement unknown;
no inference from the CPU marketing name. No Chrome CPU/GPU/RAM samples were taken.

Protocol: 5 quality recognitions; 2 explicit new-worker cold runs; 5 warm recognitions
on the second cold worker, fixed filled PNG. Total 12 recognitions across 3 workers.
Cold means worker-cold, not OS disk-cache-cold. Cold includes initialization, fixture
read, inference, cleanup and filtering; worker termination excluded. Warm means
recognition only; cleanup/filtering not included in that interval. Do not average
cold and warm together. Detector/context/server stages have 10 repetitions each;
redaction adapter has 10 per layout (30 pooled). HTTP has 10 actual responses, all 200.

All durations are milliseconds from performance.now / Python perf_counter. Min,
median, mean and max include every recorded run. Nearest-rank p95 is emitted only
for count >=20; only the pooled adapter set qualifies here, not OCR or HTTP. These
small samples do not establish statistical significance or stable tail latency.

| Stage | Count | Min ms | Median ms | Mean ms | Max ms | p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| ocrCold | 2 | 521.286 | 523.908 | 523.908 | 526.530 | -- |
| ocrInitialization | 2 | 188.518 | 189.677 | 189.677 | 190.836 | -- |
| ocrWarmInference | 5 | 247.730 | 249.229 | 250.139 | 255.755 | -- |
| visualPrivacy | 5 | 0.169 | 0.234 | 0.234 | 0.314 | -- |
| detection | 10 | 0.041 | 0.046 | 0.144 | 1.017 | -- |
| contextConstruction | 10 | 0.068 | 0.106 | 0.238 | 0.810 | -- |
| redactionCommands | 30 | 0.044 | 0.142 | 0.165 | 1.084 | 0.289 |
| serverValidation | 10 | 0.242 | 0.410 | 0.374 | 0.680 | -- |
| deterministicPlanner | 10 | 0.012 | 0.025 | 0.025 | 0.054 | -- |
| providerProjection | 10 | 0.444 | 0.731 | 0.654 | 0.824 | -- |
| deterministicHttp | 10 | 1.578 | 1.904 | 5.946 | 19.006 | -- |

The 1553-byte SafeAgentContext is produced by the current builder from the existing
fixed safe planning fixture, measured as UTF-8 JSON. Server request body is also
1553 bytes. Actual provider projection is 1058 UTF-8 bytes, excluding system prompt,
request envelope and authentication. This is not a claim about every page payload.

## Local model/runtime asset footprint

Actual extension/vendor/ocr files, including notices/README, excluding assets.json
inventory: **11092523 bytes**. WASM is embedded in the two .wasm.js files. These are
disk bytes, not RAM. Entire extension directory: 11314033
bytes at measurement, including tests/metadata; not a packaged ZIP size.

| File | Bytes |
|---|---:|
| README.md | 1749 |
| tesseract.esm.min.js | 63220 |
| worker.min.js | 111162 |
| licenses/bmp-js.txt | 1077 |
| licenses/buffer.txt | 2306 |
| licenses/idb-keyval.txt | 555 |
| licenses/ieee754.txt | 1465 |
| licenses/is-url.txt | 1036 |
| licenses/regenerator-runtime.txt | 1080 |
| licenses/runtime-notices.txt | 149 |
| licenses/tessdata.txt | 11357 |
| licenses/tesseract-core.txt | 11358 |
| licenses/tesseract-js.txt | 11357 |
| licenses/wasm-feature-detect.txt | 11341 |
| licenses/worker-notices.txt | 466 |
| licenses/zlibjs.txt | 1222 |
| lang/eng.traineddata.gz | 2952873 |
| core/tesseract-core-lstm.wasm.js | 3954181 |
| core/tesseract-core-simd-lstm.wasm.js | 3954569 |

## Live Chrome instrumentation and latency definitions

The popup Performance section starts at -- and displays only finite, allowlisted
numbers from the current run. It never loads benchmark percentages as live accuracy.
Local capture, detector, redaction, semantic guard, perception, visual guard,
context/final guard and local-total timers surround the actual existing calls.
Perception includes OCR and visual privacy filtering; the privacy panel sums the
separately timed detector/redaction/guard stages, excluding filtering inside OCR.
Some snapshot/value-collection overhead is only in local total. Containing intervals
overlap: do not add stage counters to their parent totals. Sanitized PNG bytes use
decoded bytes, not base64 character count; raw image content never enters metrics.

Plan latency in an open popup = Analyze handler start to validated response arrival,
including message transport. Worker planMs = worker receipt to result, excluding
popup transport. Planner round-trip = actual browser fetch/validation interval, only
when a request occurs. Server-Timing exposes numeric prehandler and planner durations;
prehandler includes middleware/routing/parsing/validation, not pure validation alone.
The action JSON contract stays unchanged. One-way network durations are not inferred.

Post-execution latency = Execute handler start to VERIFIED/NOT_VERIFIED result arrival;
the worker counter starts at Execute receipt. Click dispatch includes ticket/safety
checks and injected click. Verification includes Phase 8's actual **750 ms** requested
delay, one fresh same-tab capture, fresh OCR/privacy and visual matching. Its timer
does not prove success; status still requires fresh pixel evidence. No automatic
retry, replanning, provider/network request or second click was added to verification.

Machine total = plan latency + post-execution latency for the same action observation.
The interval between plan-ready and Execute receipt is recorded separately as human
confirmation (with minor message/scheduling overhead) and excluded from machine total.
Do not add it back. Failed verification can still have timings without a success claim.
Reopened popup uses the worker summary, which excludes popup transport. New analysis
resets timing state; worker restart loses it. Server timing stays separate from local
measurements and is never inserted into SafeAgentContext/provider content.

No actual Chrome plan, verification or machine-total measurement is claimed in the
reference. Node OCR and loopback HTTP cannot be summed into one. Phase 6B integrated
NVIDIA, Phase 7 positive/stale checks, Phase 8 positive/negative, and Phase 9 live
timings are **PENDING**. Current browser-control inventory exposed no browsers/apps;
key presence check was false. Historical Phase 8 browser URL-policy stop remains
historical evidence, not a new Phase 9 manual run.

## Manual resource and Chrome acceptance procedure

Follow README/server setup, reload extension 0.9.0 and reset the demo. Record actual
planner mode, Chrome version from chrome://version, OS/CPU, viewport and scaling.
Analyze/Plan: confirm real current-run timings appear alongside READY OCR, SAFE
privacy, approved context and validated CLICK. Execute: observe actual Continue
click, distinct fresh observation and VISUALLY VERIFIED, then record plan, dispatch,
verification, post-execution, human interval and machine total with status. Repeat
at least 5 runs under the same conditions; keep failures and cold/warm distinctions.
Do not turn an unobserved step into PASS. Use the Phase 8 tab-switch negative test.

For optional resources, open Chrome Task Manager with Shift+Esc. Identify extension,
offscreen OCR and relevant browser/tab processes by name/process ID (do not blindly
sum shared memory). Record the tool's memory footprint column in MB before OCR and
during OCR, plus which processes/columns were used. Browser memory percentage
requires manual Chrome measurement with an explicitly documented denominator; no
percentage is currently supplied. If sampling CPU, record displayed units, machine,
process, sampling interval, idle baseline and all observations (e.g. 1-second samples
for 10 seconds). Document other workload/power conditions. GPU remains unmeasured
unless a valid tool/process attribution is recorded. Keep manual values separate
from this automated reference until actually collected and reviewed. Do not capture
private user screens or automatically persist browser screenshots for metrics.

## Validation and limits

21 independent metrics tests cover formulas, zero denominators, statistics, UTF-8,
normalization/source checks, confusion errors, region overlap, actual redaction
commands, numeric output filtering and human-delay exclusion. Two added extension
integration/UI tests exercise real orchestration timers, skipped/actual values and
unchanged network boundary. Two server tests check safe numeric headers and unchanged
response contract. Full totals: **230 extension, 52 server**, all passing. Actual
benchmark OCR is separate evidence from those tests. Known fake canaries are checked
against serialized benchmark results; output contains aggregate counts/timings and
fixed labels/IDs only, no OCR text, raw screenshots, secrets or authorization headers.

Dataset is tiny and intentionally controlled. Detector failures remain; region
precision is not pixel coverage; clean text accuracy is not visual understanding;
resource proxies are not utilization percentages. Full manual browser/NVIDIA evidence
is outstanding. No Phase 10 polish or submission artifacts are implemented here.
Exact next task: **Phase 10 - final SIH demo polish and submission/presentation evidence**.
