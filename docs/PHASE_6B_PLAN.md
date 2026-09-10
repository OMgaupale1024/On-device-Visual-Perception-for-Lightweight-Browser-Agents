# Phase 6B plan — one privacy-safe AI planner

Inspected baseline: f356308048cf7ed5afa29ee76e88904552457605; main clean and
synchronized. Phase 6A is user Chrome-verified: POST /plan → FastAPI HTTP 200,
7 fields, 5 sensitive fields/regions, safe status, rawPiiIncluded=false, all five
placeholders, Bengaluru/Conference retained, deterministic flow working. No extra
unreported manual checks inferred.

Presence-only inspection found no provider environment variables or root/server
.env files. No credential values were read or printed. No credential provisioning
tool is available. Implement one provider; real-key verification remains pending.

1. Use OpenAI Responses API, pinned gpt-4.1-mini-2025-04-14, structured JSON output.
   It is a small non-reasoning model suitable for this bounded ID-selection task.
   Use the existing httpx dependency as the server HTTP client; no agent framework,
   provider routing or SDK dependency required. Fixed HTTPS provider URL, no tools,
   no redirects/proxies/retries, store=false and bounded response size/output tokens.
2. Preserve POST /plan and its exact five-key CLICK/STOP response. Explicit
   PLANNER_MODE=deterministic (default) or ai. No silent fallback. Expose the mode in
   X-EdgeSight-Planner response header, not the strict JSON action contract.
3. Revalidate the whole candidate context immediately before projection. Build a
   minimal JSON input containing goal, safe privacy flag, semantic fields with local
   semantics provenance, visual IDs/text/confidence with pixel-OCR provenance and
   redaction legend. Omit observation ID/timestamp/geometry/debug metadata. Bind the
   observation on our server after output validation. Guard the exact projected
   input before any provider call and cap its size without silent truncation.
4. Keep a fixed concise system prompt separate from JSON observational data. Goal
   and screen text cannot override policy; placeholders never invite reconstruction;
   filled=true is evidence of a local value. No chain-of-thought request.
5. Require exact action/target/reason output; CLICK must use a supplied visual ID,
   STOP must use null. Reject extra keys, invalid JSON, executable/PII reason content,
   refusals and incomplete outputs. Never repair malformed output or execute it.
6. Missing key/provider failures return generic 503/504; invalid output returns
   generic 502; no deterministic fallback. Keep local results and show AI on failures
   when the server mode header is available. Bound provider work to 15s and browser
   request to 20s. No metrics UI.
7. Test exact provider-bound JSON and five canaries x four contamination locations
   with provider call count=0. Test injection-as-data, grounding, malicious outputs,
   all provider failures, mode headers, existing deterministic/transport/privacy
   regressions and OCR smoke. Do not claim mocks are real-provider verification.
8. Update requested docs/AI_CONTEXT/HANDOFF, audit secrets/artifacts, commit
   feat: add privacy-safe AI planner, push normally, verify clean main equals origin,
   then STOP. Next phase: Phase 7 safe action execution, not implemented here.

This is an LLM over sanitized structured visual context, not a VLM. No images are
uploaded; the existing sanitized-image capability remains unchanged for future work.

Official references: https://developers.openai.com/api/docs/models/gpt-4.1-mini
and https://developers.openai.com/api/docs/guides/structured-outputs.
