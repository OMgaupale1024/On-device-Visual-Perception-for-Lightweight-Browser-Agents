# Phase 6A implementation plan

Inspected baseline: `ae4e37e`, main, clean and synchronized on 2026-09-10.
Only one AI writes. The user confirmed the current Chrome flow works; no additional
individual manual checks are inferred.

1. Preserve Phase 5's exact schema. Add a private WeakMap approval in the privacy
   builder after its final known-value guard. At send time require the same frozen
   object and exact approved serialization. The transport receives only that context,
   never the known-value list, raw observations, OCR, image handles or local response.
2. Send structured JSON only. The Phase 3 handle safely exposes sanitized PNG bytes,
   but image upload adds a second schema, size controls and pixel validation with no
   benefit to this deterministic planner. Defer actual image transport to Phase 6B.
3. Add one localhost config and dedicated transport client. Bound fetch + response
   reading to five seconds, disable redirects/credentials/cache, validate strict
   CLICK/STOP responses against the submitted observation and visual IDs. No execution.
4. Wire only the explicit Analyze / Plan flow in the service worker. Keep all local
   results on planner failure; show a small planner panel with accurate decision text.
5. Add minimal FastAPI/Pydantic server, strict nested schemas, generic validation
   errors (never echo rejected input), obvious-PII defence, explicit extension-origin
   CORS configuration, GET /health and POST /plan. No model, persistence or payload logs.
6. Deterministic travel demo: supported goal, one filled field for each required role,
   approved destination/purpose values and exactly one Continue visual item => CLICK
   its supplied ID. Otherwise STOP with null target. Always echo observation ID.
7. Test exact transport bytes, 5 fake values x 4 contamination locations with zero
   fetch calls, response failures and observation binding; test server validation,
   planner and CORS; run Phase 1–5 regressions and real localhost HTTP smoke.
8. Update all handoff docs with actual results and pending Chrome/server demo checklist.
   Inspect diff/artifacts, commit `feat: add privacy-safe planner transport`, push
   normally, verify HEAD == origin/main and clean tree, then stop for review.

Next task after review: Phase 6B — ONE real server-side LLM/VLM planner using the
same privacy-safe request and strict response schema. Not part of this checkpoint.
