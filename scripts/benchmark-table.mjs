export function renderMetricTable(r) {
  const percent = (v) => v === null ? 'Not measured' : (v * 100).toFixed(2) + '%';
  const ms = (v) => v == null ? 'Pending' : v.toFixed(3) + ' ms';
  const rows = [
    ['Visual-context accuracy', 'Exact safe pixel-OCR line items', r.visualContext.sampleCount + ' screens / ' + r.visualContext.expected + ' items', percent(r.visualContext.accuracy), 'Five synthetic layouts only'],
    ...['precision', 'recall', 'f1'].map((key) => ['PII ' + key, 'Actual field-signal detector', r.piiDetection.samples, percent(r.piiDetection.overall[key]), 'Not general PII in pixels']),
    ['Redaction precision', 'Final mask commands; IoU >=0.5', r.redaction.masks + ' masks', percent(r.redaction.precision), 'Canvas adapter, not Chrome pixels'],
    ['Redaction recall', 'One-to-one region matching', r.redaction.expected + ' sensitive regions', percent(r.redaction.recall), 'Coarse region coverage'],
    ['Safe-content preservation', 'No positive mask overlap', r.redaction.safeRegions + ' safe regions', percent(r.redaction.safePreservation), 'Labeled regions only'],
    ['OCR cold latency', 'New-worker total, median', r.resources.ocrCold.count, ms(r.resources.ocrCold.median), 'Node/WASM, includes fixture read/filter'],
    ['OCR warm latency', 'Recognition only, median', r.resources.ocrWarmInference.count, ms(r.resources.ocrWarmInference.median), 'Fixed filled fixture; Node/WASM'],
    ['Structured payload size', 'Current builder JSON UTF-8', 1, r.resources.safeContextBytes + ' bytes', 'Fixed safe planning fixture'],
    ['Provider input size', 'Actual Python projection UTF-8', 1, r.resources.providerInputBytes + ' bytes', 'User content, excludes system prompt/envelope'],
    ['Local OCR asset footprint', 'On-disk file sum', r.resources.localPerceptionAssets.files.length + ' files', r.resources.localPerceptionAssets.bytes + ' bytes', 'Not runtime RAM'],
    ['Deterministic HTTP latency', 'Loopback request/response median', r.latency.deterministicHttp.count, ms(r.latency.deterministicHttp.median), 'Not full plan latency; failures included'],
    ['Plan latency', 'Chrome Analyze/Plan', 0, 'Pending', 'Current-run instrumentation; manual run pending'],
    ['Post-execution verification latency', 'Chrome Execute to result', 0, 'Pending', 'Includes stabilization; manual run pending'],
    ['Full machine-pipeline latency', 'Plan plus Execute/result, no human delay', 0, 'Pending', 'Never synthesized from mixed benchmarks'],
  ];
  return '| Metric | Method | Samples | Measured result | Limitation |\n|---|---|---|---|---|\n' + rows.map((row) => '| ' + row.join(' | ') + ' |').join('\n') + '\n';
}
