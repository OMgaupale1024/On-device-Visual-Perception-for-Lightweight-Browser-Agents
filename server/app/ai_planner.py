"""Safe context -> one provider -> strict output validation -> local binding."""
import asyncio

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
        if decision.action == "CLICK":
            # Target must be a locally-grounded actionable candidate, never just any
            # visible label (e.g. "Password"). Non-actionable CLICK is rejected safely.
            if decision.target not in prepared.actionable_ids:
                raise ValueError("Non-actionable visual target")
        elif decision.target is not None:
            raise ValueError("Invalid STOP target")
        return PlanResponse(observationId=prepared.observation_id, action=decision.action,
                            target=decision.target, reason=decision.reason)
    except Exception:
        raise PlannerFailure(502) from None
