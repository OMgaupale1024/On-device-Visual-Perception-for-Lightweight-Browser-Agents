// Privacy-safe OCR diagnostics. Emits ONLY the failing stage, the error class and
// a short library message — never screenshot pixels, recognized text or known
// secrets. This is what makes a real Chrome OCR failure debuggable: the browser
// service-worker / offscreen console names the stage that broke, while the popup
// keeps its generic user-facing message. Stage vocabulary:
//   OCR_OFFSCREEN_CREATE OCR_MESSAGE_CHANNEL OCR_WORKER_CREATE OCR_CORE_LOAD
//   OCR_LANGUAGE_LOAD OCR_INIT OCR_RECOGNIZE OCR_TIMEOUT OCR_WORKER_ERROR
const TAG = '[EdgeSight OCR]';

// Reduce any thrown value to a safe {stage, name, message}. Message is collapsed
// and truncated so a library/DOM error string cannot become an exfiltration channel.
export function sanitizeError(stage, err) {
  return {
    stage,
    name: String(err?.name || 'Error').slice(0, 60),
    message: String(err?.message ?? err ?? 'unavailable').replace(/\s+/g, ' ').slice(0, 300),
  };
}

export function logError(where, diag) {
  console.error(`${TAG} ${where} ${diag.stage} ${diag.name}: ${diag.message}`);
}

export function logStage(where, stage, detail) {
  console.info(`${TAG} ${where} ${stage}${detail ? ' ' + String(detail).slice(0, 120) : ''}`);
}
