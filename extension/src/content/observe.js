// DOM / semantic observation.
//
// Injected into the active tab via chrome.scripting.executeScript({ func: observePage }).
// SERIALIZED and run in the PAGE context: it must be fully self-contained (no imports, no
// module-scope helpers, no closures).
//
// PRIVACY: this returns only structural SIGNALS per field — element type, name/id, label
// text, autocomplete. It NEVER reads or returns a field's VALUE, and never logs anything.
export function observePage() {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  const visible = (selector) =>
    Array.from(document.querySelectorAll(selector)).filter(isVisible);

  const labelFor = (el) => {
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) return (l.textContent || '').trim();
    }
    const wrap = el.closest('label');
    if (wrap) return (wrap.textContent || '').trim();
    return (el.getAttribute('aria-label') || '').trim();
  };

  const fieldEls = visible('input, select, textarea').filter(
    (el) => !(el.tagName === 'INPUT' && el.type === 'hidden')
  );
  const buttons = visible(
    'button, input[type="submit"], input[type="button"], input[type="reset"], [role="button"]'
  );
  const labels = visible('label');

  // Structural signals ONLY — never the value.
  const fieldSignals = fieldEls.map((el, i) => ({
    id: 'field_' + (i + 1),
    tag: el.tagName.toLowerCase(),
    type: (el.getAttribute('type') || el.tagName).toLowerCase(),
    name: el.name || '',
    elementId: el.id || '',
    label: labelFor(el),
    autocomplete: el.getAttribute('autocomplete') || '',
  }));

  return {
    title: document.title,
    counts: { inputs: fieldEls.length, buttons: buttons.length, labels: labels.length },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio || 1,
    fieldSignals,
  };
}
