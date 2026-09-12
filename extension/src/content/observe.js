// DOM / semantic observation.
//
// Injected into the active tab via chrome.scripting.executeScript({ func: observePage }).
// SERIALIZED and run in the PAGE context: it must be fully self-contained (no imports, no
// module-scope helpers, no closures).
//
// PRIVACY: this returns only structural SIGNALS per field — element type, name/id, label
// text, autocomplete. It NEVER reads or returns a field's VALUE, and never logs anything.
export function observePage() {
  // Isolated-world identity survives repeat observations; WeakMap holds no values.
  const state = globalThis.__edgeSightFields ??= { ids: new WeakMap(), next: 1, elements: new Map() };
  state.elements.clear();
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.bottom <= 0 ||
        rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false;
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
  const fieldSignals = fieldEls.map((el) => {
    if (!state.ids.has(el)) state.ids.set(el, 'field_' + state.next++);
    const id = state.ids.get(el);
    state.elements.set(id, el);
    const rect = el.getBoundingClientRect();
    return {
      id,
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || el.tagName).toLowerCase(),
      name: el.name || '',
      elementId: el.id || '',
      label: labelFor(el),
      autocomplete: el.getAttribute('autocomplete') || '',
    };
  });

  // Isolated-world capabilities: DOM nodes/structural signals stay on this device.
  const controlsState = globalThis.__edgeSightControls ??= { ids: new WeakMap(), next: 1, elements: new Map() };
  controlsState.elements.clear();
  controlsState.inspect = (el) => ({ tag: el.tagName.toLowerCase(),
    type: (el.getAttribute('type') || el.tagName).toLowerCase(), name: el.name || '',
    elementId: el.id || '', label: labelFor(el), autocomplete: el.getAttribute('autocomplete') || '' });
  const controls = [...new Set([...buttons, ...visible('a[href]'), ...fieldEls])].map(el => {
    if (!controlsState.ids.has(el)) controlsState.ids.set(el, 'control_' + controlsState.next++);
    const controlId = controlsState.ids.get(el);
    controlsState.elements.set(controlId, el);
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const editable = !el.disabled && !el.readOnly && (el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && ['text', 'search', 'url'].includes(type)));
    const role = editable ? (el.tagName === 'TEXTAREA' ? 'textarea' : type === 'search' ? 'searchbox' : 'input') :
      el.tagName === 'A' ? 'link' : 'button';
    const rect = el.getBoundingClientRect();
    return { controlId, fieldId: state.ids.get(el) || null, role, editable,
      supported: editable || buttons.includes(el) || el.tagName === 'A',
      focused: document.activeElement === el,
      signature: JSON.stringify(controlsState.inspect(el)),
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } };
  });

  // Geometry of clickable controls ONLY (no text, no ids) — used LOCALLY to decide
  // which pixel-OCR elements sit on an actionable control. Never sent off-device.
  const buttonRects = buttons.map((el) => {
    const rect = el.getBoundingClientRect();
    return { rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } };
  });

  return {
    title: document.title,
    counts: { inputs: fieldEls.length, buttons: buttons.length, labels: labels.length },
    buttonRects,
    controls,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio || 1,
    position: { x: window.scrollX, y: window.scrollY },
    visualViewport: window.visualViewport ? {
      scale: window.visualViewport.scale, x: window.visualViewport.offsetLeft, y: window.visualViewport.offsetTop,
    } : { scale: 1, x: 0, y: 0 },
    fieldSignals,
  };
}
