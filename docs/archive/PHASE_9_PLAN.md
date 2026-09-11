# Phase 9 plan - reproducible SIH prototype evaluation

Written before implementation. Baseline 6b8172b, main clean; fetch and pull --ff-only
completed. Existing code/tests/timing hooks and required handoff docs inspected.

## Scope and official mapping

1. Visual-context accuracy (25%): five committed, generated synthetic PNGs: filled form,
   missing field, submitted, scaled form, neutral multiple-button screen. Separately
   labeled safe text; predictions from real Tesseract/WASM pixels through existing
   normalization/privacy filtering. Exact normalized line-item matching, one-to-one,
   no fuzzy matching. Report misses/unexpected counts and all sample results.
2. PII precision/recall (20%): labeled structural field signals, five sensitive roles
   plus safe/difficult negatives and unsupported aliases. Run actual detectSensitiveFields;
   report TP/FP/FN/TN, precision/recall/F1 and per-role counts. Do not tune the detector
   to the dataset or hide failures. This measures field-signal classification, not
   general PII recognition in arbitrary pixels.
3. Redaction precision (20%): independently labeled sensitive/safe rectangles; actual
   detector and redactScreenshot implementation with an instrumented Canvas adapter.
   Score emitted final mask commands, one-to-one IoU >=0.5 (coarse localization only),
   recall, precision, and safe-region preservation (any positive overlap is damage).
   Include difficult detector cases, scaled/fractional boxes; do not claim browser pixel
   opacity or pixel-perfect privacy. Test scoring errors independently.
4. Client resources (20%): actual on-disk OCR/extension file sizes, UTF-8 safe context
   and provider projection bytes, screenshot dimensions, cold/warm OCR timings and
   cheap local-stage durations. CPU/GPU/RAM usage remains unmeasured without supported
   Chrome measurements; include manual Task Manager procedure.
5. End-to-end latency (15%): numeric current-run local capture, detection, redaction,
   semantics/guard, OCR, context/guard, planner round-trip, action preparation/dispatch,
   verification, plan and machine-total hooks. Reuse monotonic performance.now; no
   metrics in SafeAgentContext or provider content. Server may expose narrow numeric
   pre-handler/planner timing headers; do not pretend pre-handler overhead is pure
   validation or derive one-way network latency. Human confirmation delay is separate.

## Small architecture

- extension/src/metrics/metrics.js: pure math, quality scorers, allowlisted safe timing
  summaries. No DOM/transport/storage. Existing worker/popup gets a small live panel,
  no accuracy percentages or fake initial values. Preserve Phase 8 local-only behavior.
- benchmarks/fixtures/: five small synthetic PNGs plus versioned labels; Windows
  System.Drawing generator for reproducibility, fake data only, no user capture.
- scripts/benchmark.mjs plus small helpers: one CLI, quality separate from runtime
  performance in versioned JSON, sanitized aggregate output and Markdown judge table.
  Fixture hashes, code revision/dirty state, environment and every run count recorded.
  Default writes ignored output; commit one explicitly reviewed reference result.
- Python benchmark helper uses real server validation/projection/deterministic planner
  and temporary loopback HTTP, no credentials/output text retained. NVIDIA timing is
  explicitly opt-in with a configured key; otherwise pending. No new provider/library.

## Protocol fixed before measuring

Five quality samples, one OCR quality pass each. Two explicit new-worker cold runs and
five warm inference runs on the fixed filled sample (separate from quality passes).
Ten repetitions of cheap detector/redaction/context/server stages. Report raw numeric
samples plus count/min/median/mean/max; p95 only with >=20 samples. The three redaction
layouts produce 30 pooled adapter timings; this is not a browser latency percentile.
All durations ms. Never combine Node/Canvas-adapter/HTTP timings into fabricated Chrome
plan/verification/end-to-end latency. Those remain pending until measured in Chrome.
No composite weighted score: official weights are mapping, not a defined scoring rubric.

## Validation and delivery

Test math, zero denominators, exact visual source/matching, difficult detector cases,
redaction misses/false masks/partial overlap, safe output/timing projection and runtime
instrumentation. Preserve all 207 extension and 50 server regressions. Run benchmark,
npm run check and OCR smoke, inspect artifacts/secrets, document actual results and
limitations in METRICS plus all handoff docs, commit and push normally, verify remote
HEAD/clean tree, STOP. Exact next task: Phase 10 demo polish/submission evidence; not now.

Manual baseline: integrated NVIDIA, Phase 7 positive/negative, Phase 8 positive/negative
and Phase 9 live timings PENDING. Prior Computer Use URL-policy stop is historical;
do not promote tests or Node timings to manual Chrome acceptance.
