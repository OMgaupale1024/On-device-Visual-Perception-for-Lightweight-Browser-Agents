const BLOCKED = Object.freeze({ safe: false, reason: 'Sensitive data detected in outbound payload' });

// JSON-only, fail closed. Checks keys as well as values; never reports offending text.
export function checkOutbound(candidate, sensitiveValues) {
  try {
    if (!Array.isArray(sensitiveValues) || sensitiveValues.some((v) => typeof v !== 'string')) return BLOCKED;
    const secrets = sensitiveValues.filter((v) => v.length > 0);
    const seen = new Set();
    const cleanString = (s) => !secrets.some((v) => s.includes(v));
    const visit = (value) => {
      if (typeof value === 'string') return cleanString(value);
      if (value === null || typeof value === 'boolean') return true;
      if (typeof value === 'number') return Number.isFinite(value) && cleanString(String(value));
      if (typeof value !== 'object' || seen.has(value)) return false;
      if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
      seen.add(value);
      return Reflect.ownKeys(value).every((key) => {
        if (typeof key !== 'string' || !cleanString(key)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return 'value' in descriptor && visit(descriptor.value);
      });
    };
    return visit(candidate) ? { safe: true } : BLOCKED;
  } catch {
    return BLOCKED;
  }
}
