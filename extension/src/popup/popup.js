import { MSG } from '../shared/messages.js';

const byId = (id) => document.getElementById(id);
const statusEl = byId('status');
const resultsEl = byId('results');
const errorEl = byId('error');
const analyzeBtn = byId('analyze');

// Fixed, internal display names — safe to render as-is (not page-derived).
const ROLE_LABEL = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  employee_id: 'Employee ID',
  password: 'Password',
  destination: 'Destination',
  purpose: 'Purpose',
};
let previewTimer;
function clearPreviews() {
  clearTimeout(previewTimer);
  byId('original-preview').removeAttribute('src');
  byId('sanitized-preview').removeAttribute('src');
  byId('sanitized-preview').onload = null;
  byId('semantic-preview').textContent = '';
  byId('ac-preview').textContent = '';
  const canvas = byId('ocr-overlay');
  canvas.width = 0; canvas.height = 0;
  hide(byId('overlay-figure'));
}
window.addEventListener('pagehide', clearPreviews);

analyzeBtn.addEventListener('click', async () => {
  analyzeBtn.disabled = true;
  clearPreviews();
  hide(resultsEl);
  hide(errorEl);
  setStatus('Analyzing locally… OCR may take up to 45 seconds.');
  try {
    const res = await chrome.runtime.sendMessage({ type: MSG.ANALYZE_PAGE, goal: byId('goal').value });
    if (!res || !res.ok) throw new Error(res?.error || 'Analysis failed.');
    render(res);
    setStatus('Done');
  } catch (err) {
    showError(err?.message || String(err));
    setStatus('Error');
  } finally {
    analyzeBtn.disabled = false;
  }
});

function render(res) {
  const obs = res.observation ?? {};
  const counts = obs.counts ?? {};
  byId('c-inputs').textContent = counts.inputs ?? '–';
  byId('c-buttons').textContent = counts.buttons ?? '–';
  byId('c-labels').textContent = counts.labels ?? '–';

  renderSensitive(obs.fields ?? [], obs.sensitiveCount ?? 0);

  const cap = res.capture ?? {};
  byId('redacted-count').textContent = res.privacy.redactedRegions;
  byId('visual-status').textContent = res.privacy.visual;
  byId('semantic-status').textContent = res.privacy.semantic;
  byId('guard-status').textContent = res.privacy.outbound;
  if (res.safeContext) {
    byId('original-preview').src = res.localPreview.original;
    byId('sanitized-preview').src = res.safeContext.image.dataUrl;
    byId('semantic-preview').textContent = JSON.stringify(res.safeContext.semantic, null, 2);
  }
  renderPerception(res.perception, res.safeContext?.image);
  renderAgentContext(res);
  previewTimer = setTimeout(clearPreviews, 60_000);
  if (cap.ok) {
    byId('cap-status').textContent = 'Ready';
    byId('cap-res').textContent = `${cap.width} × ${cap.height}`;
  } else {
    byId('cap-status').textContent = 'Unavailable';
    byId('cap-res').textContent = '–';
    if (cap.error) showError('Capture: ' + cap.error);
  }
  show(resultsEl);
}

function renderPerception(perception, image) {
  const value = perception?.value;
  byId('ocr-status').textContent = perception?.status || 'Unavailable';
  byId('ocr-privacy').textContent = perception?.privacy || (perception?.status === 'UNSAFE' ? 'BLOCKED' : 'Unavailable');
  byId('ocr-time').textContent = value ? `${Math.round(value.processingMs)} ms` : '–';
  byId('ocr-count').textContent = value ? value.items.length : '–';
  byId('ocr-note').textContent = value ? `${value.withheldItems} sensitive or empty text lines withheld. English OCR baseline; not a ViT.` : perception?.reason || '';
  byId('ocr-timing').textContent = value ? `${value.timing.cold ? 'Cold' : 'Warm'} run · initialization ${Math.round(value.timing.initializationMs)} ms · inference ${Math.round(value.timing.inferenceMs)} ms · cleanup ${Math.round(value.timing.cleanupMs)} ms · total ${Math.round(value.timing.totalMs)} ms` : '';
  const list = byId('ocr-items'); list.textContent = '';
  if (!value) return;
  for (const item of value.items) {
    const row = document.createElement('p');
    row.className = 'ocr-item';
    const { x, y, width, height } = item.bbox;
    row.textContent = `${item.text} · ${item.confidence === null ? 'confidence unavailable' : (item.confidence * 100).toFixed(1) + '%'} · (${x}, ${y}, ${width}, ${height})`;
    list.append(row);
  }
  const preview = byId('sanitized-preview');
  const draw = () => {
    if (!preview.getAttribute('src')) return;
    const canvas = byId('ocr-overlay'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(preview, 0, 0);
    ctx.strokeStyle = '#ff4d24'; ctx.lineWidth = Math.max(2, image.width / 600);
    for (const item of value.items) { const b = item.bbox; ctx.strokeRect(b.x, b.y, b.width, b.height); }
    show(byId('overlay-figure'));
  };
  preview.onload = draw;
  if (preview.complete && preview.naturalWidth) draw();
}

function renderAgentContext(res) {
  const ctx = res.agentContext;
  byId('ac-status').textContent = res.agentContextStatus || 'Unavailable';
  if (!ctx) {
    for (const id of ['ac-obs', 'ac-fields', 'ac-visual', 'ac-hidden', 'ac-size']) byId(id).textContent = '–';
    // No context => OCR found sensitive text (REVOKED) or the guard blocked it.
    byId('ac-guard').textContent = res.agentContextStatus === 'REVOKED' ? 'REVOKED' : 'BLOCKED';
    byId('ac-ready').textContent = 'No';
    byId('ac-preview').textContent = '';
    return;
  }
  byId('ac-obs').textContent = ctx.observation.id;
  byId('ac-fields').textContent = ctx.fields.length;
  byId('ac-visual').textContent = ctx.visualElements.length;
  byId('ac-hidden').textContent = ctx.privacy.sensitiveFieldCount;
  byId('ac-guard').textContent = 'SAFE';
  byId('ac-size').textContent = `${(res.structuredContextBytes / 1024).toFixed(1)} KB`;
  byId('ac-ready').textContent = 'Yes';
  // The SAME object future transport would serialize — sanitized by construction, never raw PII.
  byId('ac-preview').textContent = JSON.stringify(ctx, null, 2);
}

function renderSensitive(fields, count) {
  const listEl = byId('sensitive-list');
  listEl.textContent = '';

  const sensitive = fields.filter((f) => f.sensitive);
  for (const f of sensitive) {
    const row = document.createElement('div');
    row.className = 'row';
    const left = document.createElement('span');
    left.textContent = '✓ ' + (ROLE_LABEL[f.role] || 'Sensitive field'); // role from fixed map
    const tag = document.createElement('b');
    tag.className = 'tag';
    tag.textContent = 'Sensitive';
    row.append(left, tag);
    listEl.append(row);
  }
  byId('sensitive-count').textContent = count;

  // Display names come from a fixed vocabulary, never DOM labels.
  const nonEl = byId('nonsensitive');
  const nonSensitive = fields.filter((f) => !f.sensitive);
  nonEl.textContent = nonSensitive.length
    ? 'Not sensitive: ' + nonSensitive.map((f) => ROLE_LABEL[f.role] || 'field').join(', ')
    : '';
}

function setStatus(text) { statusEl.textContent = text; }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function showError(msg) { errorEl.textContent = msg; show(errorEl); }
