import { observePage } from '../content/observe.js';
import { detectSensitiveFields } from '../privacy/detect.js';
import { navigationUrl } from '../shared/action-contract.js';

const blocked = reason => ({ status: 'BLOCKED', reason });

// Called only after the common ticket TTL, active-tab and URL gates.
export async function executeBrowserAction(ticket, deps, deadline) {
  const target = { tabId: ticket.tabId, documentIds: [ticket.documentId] };
  ticket.consumed = true; // One attempt, including navigation and failed dispatches.
  try {
    const [frame] = await deps.executeScript({ target, func: observePage });
    const observation = frame?.result;
    if (!observation || Math.abs(observation.viewport.width - ticket.viewport.width) > 2 ||
        Math.abs(observation.viewport.height - ticket.viewport.height) > 2) return blocked('PAGE_CHANGED');
    if (ticket.control) {
      const current = observation.controls?.find(c => c.controlId === ticket.control.controlId);
      if (!current || !current.supported || current.signature !== ticket.control.signature ||
          JSON.stringify(current.rect) !== JSON.stringify(ticket.control.rect)) return blocked('PAGE_CHANGED');
      const field = detectSensitiveFields(observation.fieldSignals).find(f => f.id === current.fieldId);
      if (field?.sensitive) return blocked('SENSITIVE_REGION');
      if (['TYPE', 'PRESS_KEY'].includes(ticket.action) && (!current.editable || !field ||
          (ticket.action === 'PRESS_KEY' && !current.focused))) return blocked('UNSAFE_ELEMENT');
    }
    if (deps.cancelled?.()) return blocked('CANCELLED');
    if ((deps.now || Date.now)() > deadline) return blocked('STALE_OBSERVATION');
    if (ticket.action === 'NAVIGATE') {
      const url = navigationUrl(ticket.plan.url);
      if (!await deps.canNavigate?.()) return blocked('BROWSING_PERMISSION_REQUIRED');
      // Recheck binding after asynchronous permission lookup and immediately before update.
      const tab = await deps.getTab(ticket.tabId);
      const active = await deps.queryActiveTab();
      if (tab.url !== ticket.url || active?.id !== ticket.tabId || active?.windowId !== ticket.windowId) return blocked('PAGE_CHANGED');
      const [binding] = await deps.executeScript({ target, func: documentBindingInPage });
      if (binding?.result !== true) return blocked('PAGE_CHANGED');
      if (deps.cancelled?.()) return blocked('CANCELLED');
      if ((deps.now || Date.now)() > deadline) return blocked('STALE_OBSERVATION');
      await deps.navigate(ticket.tabId, url, deps.cancelled);
    } else {
      const [executed] = await deps.executeScript({ target, func: browserActionInPage,
        args: [ticket.action, ticket.plan, ticket.control || null, ticket.viewport] });
      if (executed?.result?.status !== 'EXECUTED') return blocked(executed?.result?.reason || 'EXECUTION_FAILED');
    }
    return { status: 'EXECUTED', action: ticket.action, observationId: ticket.observationId,
      ...(ticket.targetVisualId ? { target: ticket.targetVisualId } : {}) };
  } catch { return blocked(deps.cancelled?.() ? 'CANCELLED' : 'PAGE_CHANGED'); }
}

export function documentBindingInPage() { return true; }

// Fixed extension code, serialized into the pinned document. No model code/selectors.
export function browserActionInPage(action, plan, control, viewport) {
  const fail = reason => ({ status: 'BLOCKED', reason });
  if (Math.abs(window.innerWidth - viewport.width) > 2 || Math.abs(window.innerHeight - viewport.height) > 2) return fail('PAGE_CHANGED');
  if (action === 'SCROLL') {
    const fractions = { SMALL: 0.25, MEDIUM: 0.6, LARGE: 0.9 };
    if (!['UP', 'DOWN'].includes(plan.direction) || !Object.hasOwn(fractions, plan.amount)) return fail('INVALID_ACTION');
    const distance = Math.min(900, Math.max(1, Math.round(window.innerHeight * fractions[plan.amount])));
    window.scrollBy({ top: distance * (plan.direction === 'UP' ? -1 : 1), behavior: 'instant' });
    return { status: 'EXECUTED' };
  }
  const state = globalThis.__edgeSightControls;
  const el = state?.elements.get(control?.controlId);
  if (!el?.isConnected || !state.inspect || JSON.stringify(state.inspect(el)) !== control.signature) return fail('PAGE_CHANGED');
  if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return fail('UNSAFE_ELEMENT');
  const rect = el.getBoundingClientRect();
  const old = control.rect;
  if (!old || Math.abs(rect.left - old.x) > 2 || Math.abs(rect.top - old.y) > 2 ||
      Math.abs(rect.width - old.width) > 2 || Math.abs(rect.height - old.height) > 2) return fail('PAGE_CHANGED');
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  const style = window.getComputedStyle(el);
  if (!rect.width || !rect.height || x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight ||
      style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 ||
      (hit !== el && !el.contains(hit))) return fail('UNSAFE_ELEMENT');
  if (action === 'CLICK') {
    if (el.tagName === 'A') {
      const url = new URL(el.href, document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (el.target && el.target !== '_self') || el.hasAttribute('download')) return fail('UNSAFE_ELEMENT');
    }
    el.click();
    return { status: 'EXECUTED' };
  }
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (!control.editable || !(el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'search', 'url'].includes(type)))) return fail('UNSAFE_ELEMENT');
  if (action === 'TYPE') {
    if (typeof plan.text !== 'string' || !plan.text.trim() || plan.text.length > 500 || /[\x00-\x1f\x7f]/.test(plan.text)) return fail('INVALID_ACTION');
    el.focus({ preventScroll: true });
    const stillEditable = () => el.isConnected && document.activeElement === el && !el.disabled && !el.readOnly &&
      JSON.stringify(state.inspect(el)) === control.signature;
    if (!stillEditable()) return fail('UNSAFE_ELEMENT');
    if (!el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: plan.text }))) return fail('INPUT_CANCELLED');
    if (!stillEditable()) return fail('UNSAFE_ELEMENT');
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, plan.text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: plan.text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (action === 'PRESS_KEY') {
    if (plan.key !== 'ENTER' || document.activeElement !== el) return fail('UNSAFE_ELEMENT');
    // Synthetic keyboard events have no native submit default. Use the form API only
    // when handlers did not cancel ENTER; pages handling ENTER themselves cancel it.
    const proceed = el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    if (proceed && el.tagName !== 'TEXTAREA' && el.form) {
      const url = new URL(el.form.action || document.URL, document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (el.form.target && el.form.target !== '_self')) return fail('UNSAFE_ELEMENT');
      HTMLFormElement.prototype.requestSubmit.call(el.form);
    }
  } else return fail('INVALID_ACTION');
  return { status: 'EXECUTED' };
}

// Listener is installed before update, with a bounded load wait and cleanup.
export function navigateTab(tabs, tabId, url, cancelled = () => false, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let updated = false, finished = false, timer, cancelTimer;
    const done = error => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearInterval(cancelTimer);
      tabs.onUpdated.removeListener(onUpdated); tabs.onRemoved.removeListener(onRemoved);
      error ? reject(new Error('NAVIGATION_FAILED')) : resolve();
    };
    const onUpdated = (id, change) => { if (id === tabId && updated && change.status === 'complete') done(); };
    const onRemoved = id => { if (id === tabId) done(true); };
    tabs.onUpdated.addListener(onUpdated); tabs.onRemoved.addListener(onRemoved);
    timer = setTimeout(() => done(true), timeoutMs);
    cancelTimer = setInterval(() => { if (cancelled()) done(true); }, 100);
    if (cancelled()) { done(true); return; }
    tabs.update(tabId, { url }).then(async () => {
      updated = true;
      const tab = await tabs.get(tabId);
      if (tab.status === 'complete') done();
    }).catch(() => done(true));
  });
}
