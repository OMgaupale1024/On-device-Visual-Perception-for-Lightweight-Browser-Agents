"""One real provider adapter. No payload/header/exception logging or retries."""
import asyncio
import json
import os
from typing import Protocol

import httpx

from .ai_contract import ModelDecision, SYSTEM_PROMPT
from .config import MODEL, PROVIDER_TIMEOUT_SECONDS

PROVIDER_URL = "https://api.openai.com/v1/responses"
MAX_RESPONSE_BYTES = 64_000


class PlannerFailure(Exception):
    def __init__(self, status_code=503):
        super().__init__("AI planner unavailable.")
        self.status_code = status_code


class PlanningProvider(Protocol):
    async def complete(self, safe_input: str) -> str: ...


class OpenAIProvider:
    def __init__(self, *, transport=None):
        # Test seam is HTTP transport only, never a second provider/base URL.
        self._transport = transport

    async def complete(self, safe_input: str) -> str:
        # Credential is read only by application code for the server-side request.
        # It is never included in prompt/config repr/errors, or sent to the browser.
        key = os.environ.get("OPENAI_API_KEY")
        if not key or not key.strip():
            raise PlannerFailure()
        payload = {
            "model": MODEL,
            "store": False,
            "max_output_tokens": 256,
            "input": [{"role": "system", "content": SYSTEM_PROMPT},
                      {"role": "user", "content": safe_input}],
            "text": {"format": {"type": "json_schema", "name": "browser_decision",
                                "strict": True, "schema": ModelDecision.model_json_schema()}},
        }
        try:
            async def exchange():
                async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT_SECONDS, follow_redirects=False,
                                             trust_env=False, transport=self._transport) as client:
                    async with client.stream("POST", PROVIDER_URL, json=payload,
                                             headers={"Authorization": "Bearer " + key}) as response:
                        if response.status_code != 200:
                            raise PlannerFailure()
                        data = bytearray()
                        async for chunk in response.aiter_bytes():
                            data.extend(chunk)
                            if len(data) > MAX_RESPONSE_BYTES:
                                raise PlannerFailure(502)
                        return json.loads(data)

            envelope = await asyncio.wait_for(exchange(), timeout=PROVIDER_TIMEOUT_SECONDS)
            if not isinstance(envelope, dict) or envelope.get("status") != "completed":
                raise PlannerFailure(502)
            # Refusal, tool calls, empty/multiple messages and incomplete responses
            # are rejected, never repaired or converted into deterministic success.
            output = envelope.get("output")
            if not isinstance(output, list) or len(output) != 1:
                raise PlannerFailure(502)
            message = output[0]
            if not isinstance(message, dict) or message.get("type") != "message" or message.get("role") != "assistant":
                raise PlannerFailure(502)
            content = message.get("content")
            if not isinstance(content, list) or len(content) != 1 or not isinstance(content[0], dict) or content[0].get("type") != "output_text":
                raise PlannerFailure(502)
            result = content[0].get("text")
            if not isinstance(result, str) or not result.strip():
                raise PlannerFailure(502)
            return result
        except (asyncio.TimeoutError, httpx.TimeoutException):
            raise PlannerFailure(504) from None
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise PlannerFailure(502) from None
        except PlannerFailure:
            raise
        except Exception:
            raise PlannerFailure() from None
