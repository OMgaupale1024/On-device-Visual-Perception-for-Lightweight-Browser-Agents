# EdgeSight progress

Current phase: **Phase 6B — privacy-safe AI planner. Complete in code; real-provider
manual verification pending because no server-side key was available.**

Phases 0–5 are implemented. **Phase 6A manually Chrome-verified by the user**:
POST /plan → FastAPI HTTP 200, 7 fields, sensitiveFieldCount=5,
redactedRegionCount=5, rawPiiIncluded=false, privacy.status=safe, all five role
placeholders, Bengaluru/Conference retained, deterministic planner working.
No unreported detailed checks are inferred.

Phase 6B adds one OpenAI Responses adapter (gpt-4.1-mini-2025-04-14), minimized and
revalidated provider input with semantic/pixel provenance, fixed policy, strict
model-output/visual-ID validation and server-owned observation binding.
Deterministic default mode is unchanged. AI mode never silently falls back.
Mode header updates the existing popup; JSON request/action contracts stay unchanged.
No images, action execution, re-observation, metrics, Pi or provider routing.

Tests: **50/50 server methods**, **120/120 extension entries**, all prior
regressions. 20 provider contamination cases block directly and through /plan
with zero provider calls; browser transport contamination regressions also pass.
23 malformed/malicious model-output cases reject. Syntax/assets/dependency checks
and genuine cold/warm OCR smoke pass. Real local HTTP checks: deterministic 200,
AI missing-key 503 with explicit mode; no provider call. See TESTING for evidence.

Known limitations: no live model/account verification, imperfect OCR and unknown-PII
detection, prompt policy does not guarantee correct model choices, fixed safe reason
vocabulary, text-only model input, CORS not authentication. No model/Chrome timing
claims. Starlette's test adapter deprecation warning remains non-failing.

Exact next task after Phase 6B review: **Phase 7 — safe browser action execution
using the current observation's visual bounding boxes. Not started.**
