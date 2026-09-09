import { MSG } from '../shared/messages.js';

const byId = (id) => document.getElementById(id);
const statusEl = byId('status');
const resultsEl = byId('results');
const errorEl = byId('error');
const analyzeBtn = byId('analyze');

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
  const counts = res.observation?.counts ?? {};
  byId('c-inputs').textContent = counts.inputs ?? '–';
  byId('c-buttons').textContent = counts.buttons ?? '–';
  byId('c-labels').textContent = counts.labels ?? '–';

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

function setStatus(text) { statusEl.textContent = text; }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function showError(msg) { errorEl.textContent = msg; show(errorEl); }
