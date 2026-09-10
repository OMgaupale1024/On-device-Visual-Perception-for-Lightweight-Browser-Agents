"""Deterministic travel-demo rules. Returns suggestions; performs no I/O."""
from .schemas import PlanResponse, SafeAgentContext, SAFE_VALUES, SENSITIVE

DEMO_GOAL = "Check whether this travel request is complete and submit it."


def plan(context: SafeAgentContext) -> PlanResponse:
    def stop(reason):
        return PlanResponse(observationId=context.observation.id, action="STOP", target=None, reason=reason)

    if " ".join(context.goal.split()).casefold() != DEMO_GOAL.casefold():
        return stop("Goal is not supported by the deterministic travel planner.")
    for role in sorted(SENSITIVE | set(SAFE_VALUES)):
        fields = [field for field in context.fields if field.role == role]
        if len(fields) != 1 or not fields[0].filled or fields[0].value == "[WITHHELD]":
            return stop("Required travel fields are missing, ambiguous or incomplete.")
    targets = [item for item in context.visualElements if item.text.strip().casefold() == "continue"]
    if len(targets) != 1:
        return stop("A unique Continue visual element is unavailable.")
    return PlanResponse(observationId=context.observation.id, action="CLICK", target=targets[0].id,
                        reason="Required fields are filled and Continue is available.")
