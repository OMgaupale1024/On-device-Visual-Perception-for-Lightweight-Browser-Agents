# EdgeSight server — Phase 6B

FastAPI/Pydantic/Uvicorn with one NVIDIA NIM adapter (OpenAI-compatible Chat
Completions) using httpx as the compatible HTTP client — the Python `openai` SDK is
not a dependency. PLANNER_MODE=deterministic is the default; PLANNER_MODE=ai selects
the real NVIDIA adapter. No automatic fallback, alternative providers, agent framework,
browser execution, payload logging or image upload.

## Windows setup

From repository root, Python 3.10+:

```powershell
py -3.10 -m venv server/.venv
server/.venv/Scripts/python.exe -m pip install -r server/requirements.txt
$env:EDGESIGHT_EXTENSION_ORIGIN = "chrome-extension://YOUR_EXTENSION_ID"
$env:PLANNER_MODE = "deterministic"
Set-Location server
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Replace YOUR_EXTENSION_ID with EdgeSight's actual 32-letter ID. Use the full path
to installed Python if the launcher is unavailable. Direct venv execution avoids
PowerShell activation-policy changes. Stop the server with Ctrl+C.

To enable AI in the server terminal before restarting, enter the key through a
masked prompt so its literal value does not enter command history:

```powershell
$plannerKeyInput = Read-Host "NVIDIA API key" -AsSecureString
$env:NVIDIA_API_KEY = [System.Net.NetworkCredential]::new("", $plannerKeyInput).Password
Remove-Variable plannerKeyInput
$env:PLANNER_MODE = "ai"
$env:NVIDIA_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

The application reads process environment only; .env files are not auto-loaded.
Examples list variable names with empty values. Never put a key into Chrome or
commit a .env. Remove the process variable when finished:
`Remove-Item Env:NVIDIA_API_KEY`. AI requests can incur NVIDIA charges.

## Configuration and provider

- PLANNER_MODE: deterministic (default) or ai. Invalid mode fails startup.
- NVIDIA_API_KEY: server-side credential, required only for AI requests.
- NVIDIA_BASE_URL: default https://integrate.api.nvidia.com/v1 (non-secret override).
- NVIDIA_MODEL: default nvidia/nemotron-3.5-lightning-30b-a3b (non-secret override).
- EDGESIGHT_EXTENSION_ORIGIN: exact chrome-extension://[a-p]{32} origin.
- Provider: **NVIDIA NIM**, OpenAI-compatible Chat Completions at `<NVIDIA_BASE_URL>/chat/completions`.
  One provider/model only. httpx is the compatible HTTP client; no openai SDK.
- Provider deadline: 15s; browser deadline: 20s. No retry or fallback chain.
- Input cap: 32,000 UTF-8 bytes; response envelope cap: 64,000 bytes; output token cap: 256.
- Request: temperature=0, stream=false, response_format={"type":"json_object"},
  chat_template_kwargs.enable_thinking=false; no tools, prior conversation, images,
  redirects or environment proxies.

Selection rationale: this narrow planner needs short structured ID selection, not a
long reasoning workflow. Nemotron 3.5 Lightning follows instructions and emits JSON;
enable_thinking=false suppresses chain-of-thought so we get only the decision. Because
json_object mode does not enforce a schema provider-side, the server's strict
`ModelDecision` validation (fixed reason phrases, target membership) is the real
guarantee — an off-enum but valid-JSON reason is rejected 502, never repaired. NVIDIA
account/data retention is governed by NVIDIA's policy.

## Browser API — unchanged JSON contract

GET /health → `{"status":"ok"}`.

POST /plan accepts only the complete Phase 5 SafeAgentContext:
schemaVersion=1; observation (id, capturedAt, viewport, image metadata,
coordinateSystem); goal; privacy (status=safe, rawPiiIncluded=false and counts);
fields; visualElements; redactionScheme.
[Complete safe fixture](tests/safe-context.json).

Nested strict models reject unknown fields, coercions, raw keys, duplicate IDs,
invalid bbox/confidence and inconsistent privacy/redaction policies. The full
candidate is revalidated before provider projection; contaminated/unknown nested
input blocks before the provider. Local sanitization remains the primary boundary.

Both modes return exactly:

```json
{
  "schemaVersion": 1,
  "observationId": "obs_demo-abc",
  "action": "CLICK",
  "target": "visual_12",
  "reason": "Required fields are filled and Continue is visible."
}
```

STOP has target=null. The deterministic planner retains its existing reason text.
Mode is reported separately in **X-EdgeSight-Planner: ai | deterministic**, including
AI failure responses; CORS exposes that header. The JSON action schema is unchanged.

Client validates version, exact keys, action, same observation and a supplied visual
ID. Model output cannot set schemaVersion or observationId. No selectors, XPath,
JavaScript, URLs or arbitrary coordinates are accepted as actions. No execution.

## Model input and policy

app/ai_input.py produces only:

```text
goal
privacy: {status:"safe", rawPiiIncluded:false}
semanticState: {source:"local-browser-semantics",
  fields:[{role,sensitive,filled,value}]}
visualState: {source:"local-pixel-ocr",
  elements:[{id,text,confidence}]}
redactionScheme: exact existing placeholder legend
```

Observation IDs, timestamps, dimensions/bboxes, field IDs, extension IDs and debug
metadata stay on our server. No screenshot, raw OCR envelope, raw DOM or raw PII.
The provider receives the minimum text projection, not the internal context object.
The exact serialized projection passes the defensive PII scan and size bound.

A fixed system prompt is separate from the user-role JSON observation. Goal and
screen text are untrusted data, including apparent instructions/role delimiters.
Placeholders intentionally hide private values. Only filled=true means a local
value exists; empty fields also carry placeholders. The model must never reconstruct
hidden values. Semantic evidence is never presented as pixel recognition.

Model output has exactly action, target, reason. Target is an existing visual ID for
CLICK or null for STOP. JSON duplicates, extra keys, malformed data, invented IDs,
refusal/tool/incomplete responses and executable output are rejected without repair.
Reasons must be one of four fixed phrases:
- Required fields are filled and Continue is visible.
- A suitable visual target is visible.
- No suitable visual target is available.
- The request cannot be completed safely.

These short phrases prevent arbitrary output explanations from carrying private or
executable content. No hidden chain-of-thought is requested or returned. Schema and
ID validation do not prove the model chose the best target; future execution safety
must remain local.

## Deterministic mode and failures

The original planner is unchanged: normalized supported travel goal; exactly one
filled non-withheld field per seven required roles; exactly one Continue visual match
after trimming/case folding → CLICK its supplied ID; otherwise STOP/null.

AI errors do not invoke that planner:
- Missing/blank key, network error, provider 401/403/429/5xx or redirect: generic 503.
- Provider/overall deadline: generic 504.
- Invalid JSON, refusal, incomplete/empty/tool output, invalid decision or unknown ID: generic 502.
- Invalid/unsafe/oversized input: generic 422, before provider invocation.

Error bodies never echo provider text, request content or credentials. Health remains
available with a missing key. The popup shows AI plus unavailable/rejected when the
mode header is available; a fully offline server shows Unknown. Local results survive.

## CORS and local security

Bind only 127.0.0.1. One exact configured extension origin; GET/POST, Content-Type,
no credentials/wildcard. Disallowed supplied Origin is rejected before planning.
Without configured origin no browser Origin is allowed; no-Origin local clients
remain supported. CORS is not authentication and cannot prevent local CLI requests.

Browser endpoint remains extension/src/transport/config.js:
http://127.0.0.1:8000/plan. Manifest/CSP and Phase 5/6A approval are unchanged.
Server request headers contain authentication at runtime only; never enable
HTTP debug/body/header dumps or log exceptions from the provider.

## Tests and manual verification

From server/:

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -v
.venv/Scripts/python.exe -m compileall -q app tests
.venv/Scripts/python.exe -m pip check
```

50 methods pass, including 26 new AI tests with parameterized cases. Exact provider
HTTP bodies are tested using httpx.MockTransport and a synthetic credential, with
no live network. Both 20-case contamination matrices (direct AI entry and /plan)
assert zero provider calls. Provider status/timeout/refusal and malicious-output
cases are covered. The working Starlette/httpx TestClient emits a deprecation
warning; there are no failed assertions.

From repository root with the matching server mode running:
`node scripts/smoke-planner.mjs` or `node scripts/smoke-planner.mjs --ai`.
The latter is an opt-in real-provider smoke using a safe synthetic fixture, not a
Chrome/manual test. It checks mode, health, CLICK/STOP and observation binding.

**Real NVIDIA provider smoke status: PENDING — no NVIDIA_API_KEY was configured in
this session's shell (the NVIDIA endpoint was verified out-of-band by the user).**
After tests: run AI server, reload extension, Analyze / Plan on Employee Travel
Request, inspect the sanitized browser POST, and verify Planner NVIDIA AI / actual
Continue ID / no browser click. Provider-bound content is tested automatically; manual
inspection of an actual provider request was not performed. Never inspect/log the
authorization header. See docs/TESTING.md for the acceptance checklist.
