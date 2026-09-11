# EdgeSight - Phase 9 handoff

**Phases 0-9 code complete. Phase 9 manual Chrome timings PENDING.**
Exact next task: **Phase 10 - final SIH demo polish + submission/presentation evidence**.
Not started. Read AI_CONTEXT.md, METRICS.md, PHASE_9_PLAN.md and TESTING.md.
Code, tests and Git are source of truth; sync before changes, never force push.

Phase 9 adds a small repeatable CLI and current-run numeric popup panel. It does not
change Phase 8's one 750 ms-delayed same-tab fresh observation, new identity, fresh
local OCR/privacy or visual-only phrase success. No verification network/provider
call, new action, retry, provider or general automation was added.

Benchmark command: npm run benchmark. Requires installed Node dependencies and server
venv. Uses actual pixel OCR, Phase 2 detector, Phase 3 final mask commands through
Canvas adapter, Phase 5 builder, server validation/projection/planner and 10 temporary
loopback HTTP requests. Default makes no NVIDIA call. Optional --ai requires a private
configured key; not run here. JSON schema version1; ignored output, reviewed committed
reference JSON/table. No user captures; committed PNGs are explicitly synthetic/fake.

## Reference evidence

- 5 screens, 41 expected safe OCR items, 41 correct:100% on these synthetic layouts only.
- PII40 candidates:TP 15 FP 6 FN 5 TN 14; precision 71.43%, recall 75%, F1 73.17%.
- Redaction3 layouts/41 sensitive/41 safe/43 commands:31 correct, 10 missed, 12 unnecessary;
  precision 72.09%, recall 75.61%, safe preservation70.73%. IoU>=0.5; not Chrome pixels.
- Cold OCR2 runs median 523.908 ms; warm5 runs median 249.229 ms (Node/WASM).
- OCR assets11092523 bytes; built context/request1553 bytes; projected input1058 bytes.
- Deterministic loopback HTTP10 runs median 1.904 ms, mean 5.946 ms, max 19.006 ms; all200.
- Chrome plan/post-execution/machine latency and CPU/GPU/RAM are unmeasured. Do not
  manufacture totals from these independent benchmark stages or omit slow samples.
- Environment/source hashes/raw numeric runs/formulas/limits in METRICS.md and
  benchmarks/reference/results.json. Windows10.0.26200x64, Ryzen9 5900HX, Node24.11.0,
  Python3.10.11, Tesseract6.0.1/core6.1.2; browser/GPU version unavailable.

Popup shows actual plan/perception/privacy/planner/click/execute/verification/total,
human interval and safe payload bytes, initially --. Human delay is excluded from
machine total; reopen uses worker timing boundaries. Server adds allowlisted numeric
Server-Timing header, action JSON unchanged. See METRICS.md for nonadditive intervals.

## Tests and manual status

230/230 extension (207 prior+23), 52/52 server (50 prior+2), 21/21 dedicated metrics tests;
syntax/manifest/assets checks pass. Real benchmark executes12 pixel recognitions across
3 workers, 10 detector/context/server repeats and30 redaction-adapter repeats.

Phase 6A user-confirmed Chrome PASS remains historical evidence. Phase 6B integrated
NVIDIA Chrome, Phase 7 positive/stale, Phase 8 positive/negative and Phase9 live Chrome
timings all PENDING. Current browser inventory exposed no browsers/apps; key presence
false. Historical Phase 8 Computer Use URL-policy block remains unchanged. No actual
click/verification/performance acceptance was observed here. Unit doubles are not
manual acceptance.

For manual acceptance: start server per README (record actual mode); reload 0.9.0,
reset Employee Travel Request, Analyze/Plan, confirm READY/SAFE/CLICK Continue and
actual timings, Execute, observe real click and fresh distinct observation with
Travel Request Submitted/VISUALLY VERIFIED. Record plan/post-execution/human/machine
intervals and failures. Negative: switch tab before 750 ms capture, expect TAB_CHANGED.
METRICS.md includes Task Manager resource procedure; no manual numbers prefilled.

Known limits: tiny correlated clean text fixtures, field-signal PII coverage errors,
coarse mask-command scoring, no native pixel opacity/resource claim, warm OS caches,
no calibrated confidence threshold. Phase 8 one-frame/activeTab/OCR/unknown-PII and
transient-worker limitations remain. No phase10 work.

Important new files: metrics/metrics.js, metrics.test.mjs, scripts/benchmark*.{mjs, py},
generate-benchmark-fixtures.ps1, benchmarks/{fixtures, reference}, server/tests/test_metrics.py,
PHASE_9_PLAN.md, METRICS.md. Modified worker/local observation/popup/transport/server,
manifest0.9.0, package scripts and all required overview docs.

Baseline6b8172b. Latest commit is the one containing this handoff, subject
feat: add SIH evaluation metrics; git log -1 --format=%H resolves its hash.
Final report records normal push, HEAD==origin/main and clean-tree verification.
Stop after Phase 9. Exact next task: Phase 10 final SIH demo polish/submission evidence.
