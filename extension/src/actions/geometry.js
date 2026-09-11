// Phase 7 — pure coordinate math. No DOM, no browser APIs, so it unit-tests in Node.
//
// The visual bbox is in SCREENSHOT pixels (SafeAgentContext.coordinateSystem =
// "screenshot-pixels"); document.elementFromPoint expects CSS VIEWPORT pixels.
// captureVisibleTab yields a viewport image at the device pixel ratio, so the two
// spaces differ by that ratio — scale by the measured ratio, never assume 1:1.
// The bbox is only ever the LOCAL one for the same observation; server geometry is
// never trusted.
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const positiveSize = (s) => !!s && finite(s.width) && finite(s.height) && s.width > 0 && s.height > 0;

export function toViewportPoint(bbox, screenshot, viewport) {
  if (!positiveSize(screenshot) || !positiveSize(viewport) || !positiveSize(bbox) ||
      !finite(bbox.x) || !finite(bbox.y)) {
    return { ok: false, reason: 'INVALID_GEOMETRY' };
  }
  const scaleX = viewport.width / screenshot.width;
  const scaleY = viewport.height / screenshot.height;
  const x = (bbox.x + bbox.width / 2) * scaleX;
  const y = (bbox.y + bbox.height / 2) * scaleY;
  const EPS = 0.5; // absorb sub-pixel rounding only — never a real out-of-bounds point
  if (x < -EPS || y < -EPS || x > viewport.width + EPS || y > viewport.height + EPS) {
    return { ok: false, reason: 'OUT_OF_VIEWPORT' };
  }
  return {
    ok: true,
    x: Math.min(Math.max(x, 0), viewport.width - 0.5),
    y: Math.min(Math.max(y, 0), viewport.height - 0.5),
  };
}

// Which pixel-OCR elements spatially sit on a clickable control, so the planner may
// only CLICK a genuine actionable target (e.g. "Continue") and never a label like
// "Password". Both boxes are screenshot pixels. Control padding and OCR line slack
// can produce very different box sizes. Match when the OCR centre is inside the
// control or at least minOverlap of the OCR area overlaps it (default 50%). Never
// expand control bounds to admit nearby text. Inputs must already be privacy-safe;
// returns only their original visual ids. Geometry stays local.
export function actionableVisualIds(items, controlRegions, minOverlap = 0.5) {
  const ids = [];
  for (const item of items || []) {
    const b = item?.bbox;
    if (!positiveSize(b) || !finite(b.x) || !finite(b.y)) continue;
    const area = b.width * b.height;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    for (const r of controlRegions || []) {
      if (!positiveSize(r) || !finite(r.x) || !finite(r.y)) continue;
      const centreInside = cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height;
      const iw = Math.min(b.x + b.width, r.x + r.width) - Math.max(b.x, r.x);
      const ih = Math.min(b.y + b.height, r.y + r.height) - Math.max(b.y, r.y);
      const contained = iw > 0 && ih > 0 ? (iw * ih) / area : 0;
      if (centreInside || (iw > 0 && ih > 0 && contained >= minOverlap)) { ids.push(item.id); break; }
    }
  }
  return ids;
}

// Defence in depth: never click a target that substantially overlaps a redacted
// sensitive region (both in screenshot pixels). The demo Continue button sits well
// outside every field mask. Missing/zero-area target is treated as unsafe.
export function overlapsSensitive(bbox, regions, threshold = 0.25) {
  if (!positiveSize(bbox) || !finite(bbox.x) || !finite(bbox.y)) return true;
  const area = bbox.width * bbox.height;
  for (const r of regions || []) {
    const iw = Math.min(bbox.x + bbox.width, r.x + r.width) - Math.max(bbox.x, r.x);
    const ih = Math.min(bbox.y + bbox.height, r.y + r.height) - Math.max(bbox.y, r.y);
    if (iw > 0 && ih > 0 && (iw * ih) / area >= threshold) return true;
  }
  return false;
}
