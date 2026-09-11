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
