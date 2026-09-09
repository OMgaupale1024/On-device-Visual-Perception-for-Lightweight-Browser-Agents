import { SENSITIVE_ROLES } from './detect.js';

// No arbitrary DOM strings are copied. Unknown non-sensitive values are withheld.
// This narrow demo vocabulary is a policy allowlist, not general PII recognition.
const SAFE_VALUES = Object.freeze({ destination: ['Bengaluru'], purpose: ['Conference', 'Training', 'Client Visit', 'Site Inspection'] });
export function sanitizeSemantics(fields, signals, localValues) {
  return { fields: fields.map((field) => {
    if (!/^field_[1-9]\d*$/.test(field.id)) throw new Error('Invalid field identity.');
    const signal = signals.find((s) => s.id === field.id);
    const local = localValues.find((v) => v.id === field.id);
    if (!local || typeof local.value !== 'string') throw new Error('Local context unavailable.');
    const sensitive = SENSITIVE_ROLES.includes(field.role);
    if (sensitive !== field.sensitive) throw new Error('Invalid field policy.');
    const safeRole = ['destination', 'purpose'].find((role) =>
      signal?.name === role && signal?.elementId === role) || 'other';
    const role = sensitive ? field.role : safeRole;
    const value = sensitive ? `[${role.toUpperCase()}]` :
      (SAFE_VALUES[role]?.includes(local.value) ? local.value : '[WITHHELD]');
    return { id: field.id, role, sensitive, value, filled: local.value.length > 0 };
  }) };
}
