"""Revalidate before projection; only minimized immutable JSON reaches the provider."""
from dataclasses import dataclass
import json

from .schemas import SafeAgentContext, reject_obvious_pii

MAX_INPUT_BYTES = 32_000


@dataclass(frozen=True)
class PreparedPlan:
    observation_id: str  # Local binding only; never part of content.
    visual_ids: tuple[str, ...]
    content: str


def prepare_ai_input(candidate: dict) -> PreparedPlan:
    # Require JSON-shaped input, not model_construct/model_copy instances that can
    # skip validation. Revalidation includes unknown nested keys BEFORE projection.
    if type(candidate) is not dict:
        raise ValueError("Invalid planning context")
    try:
        # Snapshot JSON-only data. Nested model instances cannot bypass validation.
        snapshot = json.loads(json.dumps(candidate, allow_nan=False))
        context = SafeAgentContext.model_validate(snapshot)
    except (ValueError, TypeError):
        raise ValueError("Invalid planning context") from None
    payload = {
        "goal": context.goal,
        "privacy": {"status": context.privacy.status, "rawPiiIncluded": False},
        "semanticState": {
            "source": "local-browser-semantics",
            "fields": [{"role": f.role, "sensitive": f.sensitive,
                        "filled": f.filled, "value": f.value} for f in context.fields],
        },
        "visualState": {
            "source": "local-pixel-ocr",
            "elements": [{"id": v.id, "text": v.text, "confidence": v.confidence}
                         for v in context.visualElements],
        },
        "redactionScheme": dict(context.redactionScheme),
    }
    content = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), allow_nan=False)
    # Guard the exact projected representation, then cap it without silent truncation.
    reject_obvious_pii(json.loads(content))
    if len(content.encode("utf-8")) > MAX_INPUT_BYTES:
        raise ValueError("Planning context too large")
    return PreparedPlan(context.observation.id, tuple(v.id for v in context.visualElements), content)
