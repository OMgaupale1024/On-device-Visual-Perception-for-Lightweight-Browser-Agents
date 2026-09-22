"""Safe context -> one provider -> strict output validation -> local binding."""
import asyncio
from pydantic import ValidationError

from .ai_contract import parse_decision
from .ai_input import prepare_ai_input
from .config import PROVIDER_TIMEOUT_SECONDS
from .nvidia_provider import PlannerFailure, PlanningProvider
from .schemas import PlanResponse


async def plan_ai(candidate: dict, provider: PlanningProvider) -> PlanResponse:
    # A contaminated candidate fails before provider.complete is invoked.
    prepared = prepare_ai_input(candidate)
    try:
        text = await asyncio.wait_for(provider.complete(prepared.content), timeout=PROVIDER_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        raise PlannerFailure(504, timed_out=True) from None
    except PlannerFailure:
        raise
    except Exception:
        raise PlannerFailure() from None
    try:
        decision = parse_decision(text)
    except ValidationError as error:
        # Inspect only schema locations; never emit input, reason wording, or errors.
        reason_only = all(e["loc"] == ("reason",) for e in error.errors(include_input=False, include_url=False))
        raise PlannerFailure(502, failure_code="INVALID_REASON" if reason_only else "INVALID_DECISION") from None
    except Exception:
        raise PlannerFailure(502, failure_code="INVALID_DECISION") from None
    try:
        if decision.action in {"CLICK", "TYPE"}:
            # Target must be a locally-grounded actionable candidate, never just any
            # visible label (e.g. "Password"). Non-actionable CLICK is rejected safely.
            if decision.target not in prepared.actionable_ids:
                raise PlannerFailure(502, failure_code="INVALID_TARGET")
        # An editable field is TYPE-only: its OCR text is the field's value, not a control.
        if decision.action == "CLICK" and decision.target not in prepared.clickable_ids:
            raise PlannerFailure(502, failure_code="INVALID_TARGET")
        if decision.action == "TYPE" and (decision.target not in prepared.editable_ids or decision.text not in prepared.goal):
            raise PlannerFailure(502, failure_code="INVALID_TASK_TEXT")
        if decision.action == "PRESS_KEY" and not prepared.focused_ids:
            raise PlannerFailure(502, failure_code="INVALID_FOCUS")
        return PlanResponse(observationId=prepared.observation_id, **decision.model_dump())
    except PlannerFailure:
        raise
    except Exception:
        raise PlannerFailure(502, failure_code="INVALID_DECISION") from None
