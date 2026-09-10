// Phase 5 — canonical SafeAgentContext.
//
// The ONE structure future Phase 6 transport is allowed to consume. It fuses the
// already-sanitized DOM semantic state and the already-sanitized visual (OCR) state
// into a normalized, privacy-guarded shape. It is deliberately built from SAFE inputs
// only (no raw screenshot, no raw OCR, no raw field values) so accidental leakage is
// structurally hard, and every string/number is re-checked at a final local gate.
//
// Sanitized SCREENSHOT bytes never enter this context: only image metadata
// (dimensions + redacted-region count) is carried here. The sanitized image itself
// stays behind the redact.js capability handle, so a future network layer can obtain
// only the sanitized representation, on purpose, through that separate path.
import { checkOutbound } from './guard.js';

export const SCHEMA_VERSION = 1;
const MAX_GOAL = 500;

// Fixed legend so future server reasoning can interpret placeholders WITHOUT the
// original values. Keyed by the exact placeholder sanitizeSemantics emits ([ROLE]).
const REDACTION_LEGEND = Object.freeze({
  '[NAME]': 'filled personal name hidden locally',
  '[EMAIL]': 'filled email address hidden locally',
  '[PHONE]': 'filled phone number hidden locally',
  '[EMPLOYEE_ID]': 'filled employee identifier hidden locally',
  '[PASSWORD]': 'filled password hidden locally',
});

// Untrusted user input. Coerce to string, collapse whitespace, trim, cap length.
// Stored as plain text only — never executed, never interpreted as HTML/JS.
export function validateGoal(goal) {
  if (typeof goal !== 'string') return '';
  return goal.replace(/\s+/g, ' ').trim().slice(0, MAX_GOAL);
}

export function serializeSafeAgentContext(context) {
  return JSON.stringify(context);
}

// Copy ONLY the known-safe keys of an already-sanitized semantic field. Re-copying
// (never spreading) guarantees no stray/internal key rides along into the context.
function safeField(field) {
  if (!field || typeof field.id !== 'string' || typeof field.role !== 'string' ||
      typeof field.sensitive !== 'boolean' || typeof field.filled !== 'boolean' ||
      typeof field.value !== 'string') {
    throw new Error('Malformed safe semantic field.');
  }
  return { id: field.id, role: field.role, sensitive: field.sensitive,
    filled: field.filled, value: field.value, source: 'semantic' };
}

// Copy ONLY the known-safe keys of an already-sanitized visual (OCR) item. Keeps the
// observation-scoped visual id and pixel bbox for future visual grounding (Phase 7).
function safeVisualElement(item) {
  const b = item?.bbox;
  if (!item || typeof item.id !== 'string' || typeof item.text !== 'string' || !b ||
      ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
      !(item.confidence === null ||
        (typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1))) {
    throw new Error('Malformed safe visual element.');
  }
  return { id: item.id, text: item.text,
    bbox: { x: b.x, y: b.y, width: b.width, height: b.height },
    confidence: item.confidence ?? null, source: 'visual' };
}

// Build the canonical SafeAgentContext from already-safe inputs. Structural problems
// throw (programmer error); a privacy-contamination failure returns {status:'BLOCKED'}
// (fail closed, generic reason — never echoes the offending value).
export function buildSafeAgentContext({ goal, semantic, visualState, image, observation, sensitiveValues }) {
  if (!observation || typeof observation.id !== 'string' || !/^obs_[\w-]+$/.test(observation.id) ||
      typeof observation.capturedAt !== 'string' || !observation.viewport ||
      !Number.isFinite(observation.viewport.width) || !Number.isFinite(observation.viewport.height)) {
    throw new Error('Missing observation metadata.');
  }
  if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) ||
      !Number.isInteger(image.redactedRegions) || image.redactedRegions < 0) {
    throw new Error('Missing sanitized image metadata.');
  }
  if (!semantic || !Array.isArray(semantic.fields)) throw new Error('Missing safe semantic state.');
  if (!Array.isArray(sensitiveValues) || sensitiveValues.some((v) => typeof v !== 'string')) {
    throw new Error('Invalid sensitive value set.');
  }

  const fields = semantic.fields.map(safeField);
  // visualState is the SAFE visual value (perception.value) or null when OCR was
  // unavailable/blocked; semantic context is still emitted in that case.
  const visualElements = (visualState && Array.isArray(visualState.items))
    ? visualState.items.map(safeVisualElement) : [];

  // Legend contains ONLY placeholders actually present, drawn from the fixed legend.
  const redactionScheme = {};
  for (const f of fields) {
    if (f.sensitive && REDACTION_LEGEND[f.value]) redactionScheme[f.value] = REDACTION_LEGEND[f.value];
  }

  const context = {
    schemaVersion: SCHEMA_VERSION,
    observation: {
      id: observation.id,
      capturedAt: observation.capturedAt,
      viewport: { width: observation.viewport.width, height: observation.viewport.height },
      image: { width: image.width, height: image.height, redactedRegions: image.redactedRegions },
      coordinateSystem: 'screenshot-pixels',
    },
    goal: validateGoal(goal),
    privacy: {
      status: 'safe',
      sensitiveFieldCount: fields.filter((f) => f.sensitive).length,
      redactedRegionCount: image.redactedRegions,
      rawPiiIncluded: false,
    },
    fields,
    visualElements,
    redactionScheme,
  };

  // FINAL LOCAL GATE — fail closed. Two independent checks over what Phase 6 would send:
  //  1) structural guard (keys AND values, nested objects, cycles, non-plain rejected),
  //  2) a raw scan of the exact serialized bytes for any known sensitive value.
  const serialized = serializeSafeAgentContext(context);
  const canon = serialized.normalize('NFKC');
  const secrets = sensitiveValues.filter((v) => v.length > 0);
  if (!checkOutbound(context, sensitiveValues).safe || secrets.some((v) => canon.includes(v))) {
    return { status: 'BLOCKED', reason: 'Safe agent context rejected by privacy guard.' };
  }

  const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
  // Serialized byte size for future client/network efficiency evaluation (Phase 9).
  return { status: 'READY', context: freeze(context), bytes: new TextEncoder().encode(serialized).length };
}
