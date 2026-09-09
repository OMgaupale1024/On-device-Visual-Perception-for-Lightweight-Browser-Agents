// DOM / semantic observation.
//
// This function is injected into the active tab via
// chrome.scripting.executeScript({ func: observePage }). It is SERIALIZED and runs in the
// PAGE context, so it must be fully self-contained: no imports, no module-scope helpers,
// no closures. Everything it needs is defined inside.
export function observePage() {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  const visible = (selector) =>
    Array.from(document.querySelectorAll(selector)).filter(isVisible);

  const inputs = visible('input, select, textarea').filter(
    (el) => !(el.tagName === 'INPUT' && el.type === 'hidden')
  );
  const buttons = visible(
    'button, input[type="submit"], input[type="button"], input[type="reset"], [role="button"]'
  );
  const labels = visible('label');

  return {
    title: document.title,
    counts: { inputs: inputs.length, buttons: buttons.length, labels: labels.length },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}
