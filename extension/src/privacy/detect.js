// Local sensitive-field detection (Phase 2).
//
// Pure functions — no DOM, no chrome APIs, no I/O, no logging. Given a field's structural
// SIGNALS (type, name/id, label, autocomplete — NEVER its value), classify it into a role.
//
// PRIVACY: detection reads only signals; it never receives, reads, logs, or returns raw
// field values. Even if a caller passes a `value` on the signal, it is ignored, and output
// objects contain only { id, role, sensitive, label }.

export const SENSITIVE_ROLES = Object.freeze(['name', 'email', 'phone', 'password', 'employee_id']);
const SENSITIVE_SET = new Set(SENSITIVE_ROLES);

// Conservative name signals — deliberately avoid "username", "nickname", "file name",
// "screen name", "host name", etc. Only standard autocomplete tokens, explicit name
// phrases, or an exact "name" label/attribute count.
const NAME_LABEL = /\b(full name|first name|last name|middle name|employee name|your name|contact name|applicant name|cardholder name|given name|family name)\b/;
const NAME_ATTR = /\b(fullname|firstname|lastname|first_name|last_name|given_name|family_name|fname|lname|mname)\b/;

export function classifyField(signal) {
  const type = (signal.type || '').toLowerCase();
  const ac = (signal.autocomplete || '').toLowerCase();
  const name = (signal.name || '').toLowerCase();
  const idAttr = (signal.elementId || '').toLowerCase();
  const label = (signal.label || '').toLowerCase().trim();
  const hay = [name, idAttr, label].join(' '); // textual signals only — never values

  // 1. Password
  if (type === 'password' || ac.includes('current-password') || ac.includes('new-password') ||
      /\b(password|passwd|pwd)\b/.test(hay)) {
    return 'password';
  }
  // 2. Email
  if (type === 'email' || ac.includes('email') || /\b(e-?mail)\b/.test(hay)) {
    return 'email';
  }
  // 3. Phone
  if (type === 'tel' || ac.includes('tel') ||
      /\b(phone|mobile|telephone)\b/.test(hay) || /\bcontact\s*(no|number)\b/.test(hay)) {
    return 'phone';
  }
  // 4. Employee ID (specific — checked before name)
  if (/\bemp(loyee)?\s*[_-]?\s*id\b/.test(hay) ||
      /\b(employeeid|empid|emp_no|employee number)\b/.test(hay)) {
    return 'employee_id';
  }
  // 5. Name (conservative)
  if (ac === 'name' || ac.includes('given-name') || ac.includes('family-name') ||
      ac.includes('additional-name') ||
      NAME_LABEL.test(hay) || NAME_ATTR.test(hay) ||
      name === 'name' || label === 'name') {
    return 'name';
  }
  return 'other';
}

// Map a list of field signals to sanitized detection metadata. Output objects expose ONLY
// { id, role, sensitive, label } — signals (name/id/type/autocomplete) and any value are dropped.
export function detectSensitiveFields(signals) {
  return (signals || []).map((s) => {
    const role = classifyField(s);
    return { id: s.id, role, sensitive: SENSITIVE_SET.has(role), label: s.label || '' };
  });
}

export function countSensitive(fields) {
  return fields.filter((f) => f.sensitive).length;
}
