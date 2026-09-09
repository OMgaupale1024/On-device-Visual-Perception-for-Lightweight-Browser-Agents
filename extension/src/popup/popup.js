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
};

analyzeBtn.addEventListener('click', async () => {
  analyzeBtn.disabled = true;
  hide(errorEl);
  setStatus('Analyzing…');
  try {
    const res = await chrome.runtime.sendMessage({ type: MSG.ANALYZE_PAGE });
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

  // Non-sensitive labels are page-derived → set via textContent only (never innerHTML).
  const nonEl = byId('nonsensitive');
  const nonSensitive = fields.filter((f) => !f.sensitive);
  nonEl.textContent = nonSensitive.length
    ? 'Not sensitive: ' + nonSensitive.map((f) => f.label || ROLE_LABEL[f.role] || 'field').join(', ')
    : '';
}

function setStatus(text) { statusEl.textContent = text; }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function showError(msg) { errorEl.textContent = msg; show(errorEl); }
