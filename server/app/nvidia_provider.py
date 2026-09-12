"""One real provider: NVIDIA NIM (OpenAI-compatible Chat Completions) over httpx.

httpx is used purely as the OpenAI-compatible HTTP client; no OpenAI SDK, no second
provider, no base URL other than the configured NVIDIA endpoint. No payload/header/
exception logging or retries."""
import asyncio
import json
import os
from typing import Protocol

import httpx

from .ai_contract import SYSTEM_PROMPT
from .config import BASE_URL, MODEL, PROVIDER_TIMEOUT_SECONDS

PROVIDER_URL = BASE_URL.rstrip("/") + "/chat/completions"
MAX_RESPONSE_BYTES = 64_000


class PlannerFailure(Exception):
    def __init__(self, status_code=503, upstream_status=None, *, timed_out=False, failure_code=None):
        super().__init__("AI planner unavailable.")
        self.status_code = status_code
        # Numeric upstream NVIDIA HTTP status when the failure was a provider non-200
        # (e.g. 404 wrong model, 401 bad key, 429 rate limit). Diagnostic only; no body.
        self.upstream_status = upstream_status
        # Internal diagnostic only; never includes exception text or provider data.
        self.timed_out = timed_out
        allowed = {"PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "UPSTREAM_HTTP_ERROR",
                   "INVALID_PROVIDER_RESPONSE", "INVALID_DECISION", "INVALID_REASON",
                   "INVALID_TARGET", "INVALID_TASK_TEXT", "INVALID_FOCUS"}
        default = ("PROVIDER_TIMEOUT" if timed_out else "UPSTREAM_HTTP_ERROR" if upstream_status is not None
                   else "INVALID_PROVIDER_RESPONSE" if status_code == 502 else "PROVIDER_UNAVAILABLE")
        self.failure_code = failure_code if failure_code in allowed else default


class PlanningProvider(Protocol):
    async def complete(self, safe_input: str) -> str: ...


class NvidiaProvider:
    def __init__(self, *, transport=None):
        # Test seam is HTTP transport only, never a second provider/base URL.
        self._transport = transport

    async def complete(self, safe_input: str) -> str:
        # Credential is read only by application code for the server-side request.
        # It is never included in prompt/config repr/errors, or sent to the browser.
        key = os.environ.get("NVIDIA_API_KEY")
        if not key or not key.strip():
            raise PlannerFailure()
        payload = {
            "model": MODEL,
            "temperature": 0,
            "stream": False,
            # ponytail: 96 caps worst-case latency (~30s hang seen when the model
            # ran to the old 256-token budget on an ambiguous STOP). A valid one-action
            # decision is ~20-80 tokens; raise only if a legit long NAVIGATE URL truncates.
            "max_tokens": 96,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                         {"role": "user", "content": safe_input}],
            # ponytail: nemotron-specific; disables chain-of-thought so we get a short
            # structured decision, not reasoning. Drop if a future model 400s on it.
            "chat_template_kwargs": {"enable_thinking": False},
        }
        try:
            async def exchange():
                async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT_SECONDS, follow_redirects=False,
                                             trust_env=False, transport=self._transport) as client:
                    async with client.stream("POST", PROVIDER_URL, json=payload,
                                             headers={"Authorization": "Bearer " + key}) as response:
                        if response.status_code != 200:
                            raise PlannerFailure(upstream_status=response.status_code)
                        data = bytearray()
                        async for chunk in response.aiter_bytes():
                            data.extend(chunk)
                            if len(data) > MAX_RESPONSE_BYTES:
                                raise PlannerFailure(502)
                        return json.loads(data)

            envelope = await asyncio.wait_for(exchange(), timeout=PROVIDER_TIMEOUT_SECONDS)
            # Refusal, tool calls, empty/multiple choices and reasoning-only responses
            # are rejected, never repaired or converted into deterministic success.
            if not isinstance(envelope, dict):
                raise PlannerFailure(502)
            choices = envelope.get("choices")
            if not isinstance(choices, list) or len(choices) != 1:
                raise PlannerFailure(502)
            message = choices[0].get("message") if isinstance(choices[0], dict) else None
            if not isinstance(message, dict) or message.get("role") != "assistant":
                raise PlannerFailure(502)
            if message.get("tool_calls") or message.get("refusal"):
                raise PlannerFailure(502)
            result = message.get("content")
            if not isinstance(result, str) or not result.strip():
                raise PlannerFailure(502)
            return result
        except (asyncio.TimeoutError, httpx.TimeoutException):
            raise PlannerFailure(504, timed_out=True) from None
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise PlannerFailure(502) from None
        except PlannerFailure:
            raise
        except Exception:
            raise PlannerFailure() from None
