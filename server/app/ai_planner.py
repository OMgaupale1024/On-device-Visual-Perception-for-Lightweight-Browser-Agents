"""Safe context -> one provider -> strict output validation -> local binding."""
import asyncio

from .ai_contract import parse_decision
from .ai_input import prepare_ai_input
from .config import PROVIDER_TIMEOUT_SECONDS
from .openai_provider import PlannerFailure, PlanningProvider
from .schemas import PlanResponse


async def plan_ai(candidate: dict, provider: PlanningProvider) -> PlanResponse:
    # A contaminated candidate fails before provider.complete is invoked.
    prepared = prepare_ai_input(candidate)
    try:
        text = await asyncio.wait_for(provider.complete(prepared.content), timeout=PROVIDER_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        raise PlannerFailure(504) from None
    except PlannerFailure:
        raise
    except Exception:
        raise PlannerFailure() from None
    try:
        decision = parse_decision(text)
        if decision.action == "CLICK":
            if decision.target not in prepared.visual_ids:
                raise ValueError("Unknown visual target")
        elif decision.target is not None:
            raise ValueError("Invalid STOP target")
        return PlanResponse(observationId=prepared.observation_id, action=decision.action,
                            target=decision.target, reason=decision.reason)
    except Exception:
        raise PlannerFailure(502) from None
