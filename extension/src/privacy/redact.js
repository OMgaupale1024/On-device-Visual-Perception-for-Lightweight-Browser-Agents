import { sensitiveRegions } from './geometry.js';
import { checkOutbound } from './guard.js';

// Capability boundary: only this module can mint a handle, only after Canvas redaction.
// Neither raw data URLs nor lookalike objects are accepted by buildOutboundPackage.
const sanitizedImages = new WeakMap();

async function encode(canvas) {
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return 'data:image/png;base64,' + btoa(binary);
}

export async function redactScreenshot(raw, fields, viewport) {
  if (typeof raw !== 'string' || !raw.startsWith('data:image/png;base64,')) throw new Error('Invalid local capture.');
  const bytes = Uint8Array.from(atob(raw.slice(22)), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  let canvas;
  try {
    const dimensions = { width: bitmap.width, height: bitmap.height };
    const regions = sensitiveRegions(fields, viewport, dimensions);
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Local canvas unavailable.');
    ctx.drawImage(bitmap, 0, 0);
    // Even the LOCAL original preview masks password regions, including revealed passwords.
    ctx.fillStyle = '#000';
    for (const box of regions.filter((r) => r.role === 'password')) ctx.fillRect(box.x, box.y, box.width, box.height);
    const originalPreview = await encode(canvas);
    for (const box of regions) ctx.fillRect(box.x, box.y, box.width, box.height);
    const sanitized = await encode(canvas);
    if (regions.length && sanitized === raw) throw new Error('Visual redaction could not be verified.');
    const handle = Object.freeze({});
    sanitizedImages.set(handle, Object.freeze({ dataUrl: sanitized, ...dimensions, redactedRegions: regions.length }));
    return { handle, originalPreview, ...dimensions, redactedRegions: regions.length };
  } finally {
    bitmap.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

// Mandatory future outbound gateway. No transport exists in Phase 3.
// Validate, snapshot, then check the full package; caller mutations cannot taint it.
export function buildOutboundPackage(handle, semantic, sensitiveValues) {
  const image = sanitizedImages.get(handle);
  if (!image) throw new Error('Sanitized image required.');
  if (!checkOutbound(semantic, sensitiveValues).safe) throw new Error('Sensitive data detected in outbound payload');
  const context = { semantic: structuredClone(semantic), image: { ...image }, scope: 'visible-dom-fields' };
  if (!checkOutbound(context, sensitiveValues).safe) throw new Error('Sensitive data detected in outbound payload');
  const freeze = (value) => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  return freeze(context);
}
