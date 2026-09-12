// Strict action parameters shared by transport and local ticket creation.
export const ACTION_FIELDS = Object.freeze({ CLICK: ['target'], TYPE: ['target', 'text'],
  PRESS_KEY: ['key'], SCROLL: ['direction', 'amount'], NAVIGATE: ['url'], STOP: [] });

export function navigationUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\x00-\x1f\x7f]/.test(value) || /%0/i.test(value)) throw new Error('Invalid URL');
  const url = new URL(value);
  if (!/^https?:\/\//i.test(value) || !['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || !safeTaskText(value)) throw new Error('Invalid URL');
  return url.href;
}

export function safeTaskText(text) {
  if (typeof text !== 'string') return false;
  const normalized = text.normalize('NFKC').toLowerCase();
  return !(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bemp[\s_-]*\d+\b|(?:\d[\s()+.-]*){7,}/.test(normalized) ||
    ['rahulsharma', 'rahulexamplecom', '9876543210', 'emp1024', 'secret123'].some(v => normalized.replace(/[^a-z0-9]/g, '').includes(v)));
}

export function validateAction(value, context) {
  const fields = ACTION_FIELDS[value?.action];
  if (!fields || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Plan rejected.');
  const allowed = ['action', 'schemaVersion', 'observationId', 'reason', ...fields];
  if (value.action === 'STOP') allowed.push('target');
  if (Object.keys(value).some(k => !allowed.includes(k)) || fields.some(k => value[k] == null)) throw new Error('Plan rejected.');
  const candidates = context?.visualElements?.filter(v => context.actionCandidates?.includes(v.id)) || [];
  const target = candidates.filter(v => v.id === value.target);
  if (['CLICK', 'TYPE'].includes(value.action) && (typeof value.target !== 'string' || !/^visual_[1-9]\d*$/.test(value.target) || target.length !== 1)) throw new Error('Plan rejected.');
  if (value.action === 'TYPE' && (target[0].editable !== true || !['input', 'searchbox', 'textarea'].includes(target[0].role) ||
      typeof value.text !== 'string' || !value.text.trim() || value.text.length > 500 || /[\x00-\x1f\x7f]/.test(value.text) || !safeTaskText(value.text) || !context.goal.includes(value.text))) throw new Error('Plan rejected.');
  if (value.action === 'PRESS_KEY' && (value.key !== 'ENTER' || !candidates.some(v => v.editable === true && v.focused === true))) throw new Error('Plan rejected.');
  if (value.action === 'SCROLL' && (!['UP', 'DOWN'].includes(value.direction) || !['SMALL', 'MEDIUM', 'LARGE'].includes(value.amount))) throw new Error('Plan rejected.');
  if (value.action === 'NAVIGATE') navigationUrl(value.url);
  if (value.action === 'STOP' && value.target != null) throw new Error('Plan rejected.');
  return value;
}
