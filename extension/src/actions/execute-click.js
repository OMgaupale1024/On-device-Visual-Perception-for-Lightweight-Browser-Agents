// Phase 7 — safe, visually grounded single click.
//
// The server chose WHAT (CLICK visual_N); the browser decides WHERE and HOW, using
// only the LOCAL bbox for the SAME observation. No selector/coordinate/code ever
// comes from the server.
//
//  ticketForPlan()  binds a validated CLICK plan to its observation + target (defence
//                   in depth beyond the transport validator).
//  executeTicket()  LOCAL execution policy (runs in the service worker): tab/page/
//                   stale/geometry/sensitive gates, then ONE dispatch. Single-use.
//  clickInPage()    SERIALIZED into the observed document (no imports/closures):
//                   elementFromPoint -> interactive ancestor -> validate -> one click.
import { toViewportPoint, overlapsSensitive } from './geometry.js';

// Freshness bound for a pending action. Matches the popup's 60s local-preview
// lifetime; there is no server-side observation store to reuse.
export const EXECUTION_TTL_MS = 60_000;

const blocked = (reason) => ({ status: 'BLOCKED', reason });

// LOCAL-ONLY, single-use capability. Never sent to NVIDIA or FastAPI, never persisted.
export function createTicket(fields) {
  return { ...fields, createdAt: fields.now ?? Date.now(), consumed: false };
}

// Build a ticket only for a validated CLICK whose observation + target match the
// exact local context. STOP, mismatched observation, or unknown target -> no ticket.
// `local` carries browser-only execution metadata that never enters SafeAgentContext.
export function ticketForPlan(plan, context, local, now = Date.now()) {
  if (!plan || plan.action !== 'CLICK') return null;
  if (!context || !context.observation || plan.observationId !== context.observation.id) return null;
  const target = (context.visualElements || []).find((v) => v.id === plan.target);
  if (!target) return null;
  return createTicket({
    observationId: context.observation.id,
    tabId: local.tabId, windowId: local.windowId, documentId: local.documentId, url: local.url,
    targetVisualId: target.id, bbox: target.bbox, targetText: target.text,
    screenshot: { width: context.observation.image.width, height: context.observation.image.height },
    viewport: context.observation.viewport,
    sensitiveRegions: local.sensitiveRegions || [],
    now,
  });
}

export async function executeTicket(ticket, deps) {
  const { queryActiveTab, getTab, executeScript, now = Date.now } = deps;
  if (!ticket || ticket.consumed) return blocked('ACTION_ALREADY_CONSUMED');
  if (now() - ticket.createdAt > EXECUTION_TTL_MS) return blocked('STALE_OBSERVATION');

  // Tab binding: the observed tab must still exist and still be the active/visible one,
  // and must not have navigated. Fail closed rather than click some other page.
  let tab;
  try { tab = await getTab(ticket.tabId); } catch { return blocked('TAB_CHANGED'); }
  if (!tab) return blocked('TAB_CHANGED');
  const active = await queryActiveTab();
  if (!active || active.id !== ticket.tabId || active.windowId !== ticket.windowId) return blocked('TAB_CHANGED');
  if (ticket.url && tab.url && tab.url !== ticket.url) return blocked('PAGE_CHANGED');

  const point = toViewportPoint(ticket.bbox, ticket.screenshot, ticket.viewport);
  if (!point.ok) return blocked(point.reason);
  if (overlapsSensitive(ticket.bbox, ticket.sensitiveRegions)) return blocked('SENSITIVE_REGION');

  // Consume BEFORE dispatch: at most one click attempt per ticket, no replay.
  ticket.consumed = true;
  let result;
  try {
    // documentIds pins the exact document; a navigated-away document rejects here.
    const [frame] = await executeScript({
      target: { tabId: ticket.tabId, documentIds: [ticket.documentId] },
      func: clickInPage,
      args: [point.x, point.y, ticket.viewport, ticket.targetText],
    });
    result = frame?.result;
  } catch {
    return blocked('PAGE_CHANGED');
  }
  if (!result || result.status !== 'EXECUTED') return blocked(result?.reason || 'EXECUTION_FAILED');
  return { status: 'EXECUTED', action: 'CLICK', observationId: ticket.observationId, target: ticket.targetVisualId };
}

// SERIALIZED into the page by chrome.scripting.executeScript. Must be fully
// self-contained: no imports, no module-scope helpers, no closures. Returns only a
// small fixed status/reason — never DOM nodes, HTML or page text.
export function clickInPage(x, y, expectedViewport, targetText) {
  if (Math.abs(window.innerWidth - expectedViewport.width) > 2 ||
      Math.abs(window.innerHeight - expectedViewport.height) > 2) {
    return { status: 'BLOCKED', reason: 'PAGE_CHANGED' };
  }
  const hit = document.elementFromPoint(x, y);
  if (!hit) return { status: 'BLOCKED', reason: 'NO_ELEMENT_AT_POINT' };

  const interactive = (n) => {
    if (!n || n.nodeType !== 1) return false;
    const tag = n.tagName;
    const type = (n.getAttribute('type') || '').toLowerCase();
    const role = (n.getAttribute('role') || '').toLowerCase();
    return tag === 'BUTTON' ||
      (tag === 'INPUT' && (type === 'button' || type === 'submit')) ||
      role === 'button';
  };
  // The point may land on a text/icon child; walk up to a supported control only.
  let target = null;
  for (let n = hit, i = 0; n && i < 6; n = n.parentElement, i++) {
    if (interactive(n)) { target = n; break; }
  }
  if (!target || !target.isConnected) return { status: 'BLOCKED', reason: 'UNSAFE_ELEMENT' };
  if (target.disabled || target.getAttribute('aria-disabled') === 'true') {
    return { status: 'BLOCKED', reason: 'DISABLED_ELEMENT' };
  }
  const rect = target.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return { status: 'BLOCKED', reason: 'UNSAFE_ELEMENT' };
  const style = window.getComputedStyle(target);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return { status: 'BLOCKED', reason: 'UNSAFE_ELEMENT' };
  }
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    return { status: 'BLOCKED', reason: 'UNSAFE_ELEMENT' };
  }
  // Not covered by an unrelated element at the click point.
  if (hit !== target && !target.contains(hit) && !(hit.contains && hit.contains(target))) {
    return { status: 'BLOCKED', reason: 'UNSAFE_ELEMENT' };
  }
  // Execution-safety consistency check ONLY (not visual perception evidence): the
  // resolved control's text should be consistent with the OCR'd target text. Lenient
  // (substring either way) so minor OCR variance does not make the demo brittle.
  if (targetText) {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const want = norm(targetText);
    const got = norm(target.innerText || target.textContent || target.value ||
      target.getAttribute('aria-label') || '');
    if (want && got && !got.includes(want) && !want.includes(got)) {
      return { status: 'BLOCKED', reason: 'UNSAFE_ELEMENT' };
    }
  }
  target.click();
  return { status: 'EXECUTED' };
}
