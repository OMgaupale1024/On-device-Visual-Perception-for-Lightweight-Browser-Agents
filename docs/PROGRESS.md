# EdgeSight progress

Current phase: **Phase 7 — safe, visually grounded browser execution. Complete in code;
the manual Chrome click demo is pending (unpacked extension not loaded in the coding
shell). Phase 6B end-to-end AI verification also still pending — no NVIDIA_API_KEY was
configured this session, though the NVIDIA endpoint was verified out-of-band.**

Phases 0–5 are implemented. **Phase 6A manually Chrome-verified by the user**:
POST /plan → FastAPI HTTP 200, 7 fields, sensitiveFieldCount=5,
redactedRegionCount=5, rawPiiIncluded=false, privacy.status=safe, all five role
placeholders, Bengaluru/Conference retained, deterministic planner working.
No unreported detailed checks are inferred.

Phase 6B uses one NVIDIA NIM adapter (nvidia/nemotron-3.5-lightning-30b-a3b via the
OpenAI-compatible Chat Completions endpoint), minimized and revalidated provider input
with semantic/pixel provenance, fixed policy, strict model-output/visual-ID validation
and server-owned observation binding.
Deterministic default mode is unchanged. AI mode never silently falls back.
Mode header updates the existing popup; JSON request/action contracts stay unchanged.

Phase 7 executes a validated CLICK locally: the server chooses WHAT (visual_N); the
browser converts the LOCAL screenshot-pixel bbox to a CSS viewport point, resolves the
element via elementFromPoint against a small clickable allowlist, validates it, and
performs ONE guarded, single-use element.click() bound to the same observation/tab/
document. STOP does nothing. An explicit EXECUTE SUGGESTED ACTION button triggers it;
the server never supplies selectors/coordinates/code. No re-observation or success
verification (Phase 8); the UI reports only "CLICK DISPATCHED". Still no typing/
navigation/scroll/downloads/multi-step actions, metrics, Pi or provider routing.

Tests: **50/50 server methods**, **152/152 extension entries** (32 new Phase 7:
geometry incl. non-1:1 pixel density, observation/target binding, tab/page/stale
policy, replay, and element-safety against a DOM stub), all prior regressions. 20
provider contamination cases block directly and through /plan with zero provider calls;
browser transport contamination regressions also pass. 23 malformed/malicious
model-output cases reject. Syntax/assets/dependency checks and genuine cold/warm OCR
smoke pass. Real local HTTP checks: deterministic 200, AI missing-key 503 with explicit
mode; no provider call. See TESTING for evidence.

Known limitations: no live model/account verification, imperfect OCR and unknown-PII
detection, prompt policy does not guarantee correct model choices, fixed safe reason
vocabulary, text-only model input, CORS not authentication. Phase 7 clicks only
button-like targets and does not verify task success. Manual Chrome click demo pending.
No model/Chrome timing claims. Starlette's test adapter deprecation warning is non-failing.

Exact next task after Phase 7 review: **Phase 8 — re-observation and visual verification:
fresh capture after the click → new observation → local OCR/CV → confirm the outcome
(e.g. "Travel Request Submitted"). Not started.**
