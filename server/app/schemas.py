"""Strict Phase 5 wire contract. Local sanitization remains the primary boundary."""
import re
import unicodedata
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


Positive = Annotated[float, Field(gt=0, le=100_000)]
Count = Annotated[int, Field(ge=0, le=10_000)]
ObservationId = Annotated[str, Field(pattern=r"^obs_[a-zA-Z0-9_-]+$", max_length=100)]
VisualId = Annotated[str, Field(pattern=r"^visual_[1-9][0-9]*$", max_length=50)]
SENSITIVE = {"name", "email", "phone", "employee_id", "password"}
SAFE_VALUES = {"destination": {"Bengaluru"},
               "purpose": {"Conference", "Training", "Client Visit", "Site Inspection"}}
LEGEND = {
    "[NAME]": "filled personal name hidden locally",
    "[EMAIL]": "filled email address hidden locally",
    "[PHONE]": "filled phone number hidden locally",
    "[EMPLOYEE_ID]": "filled employee identifier hidden locally",
    "[PASSWORD]": "filled password hidden locally",
}


def reject_obvious_pii(value, free_text=False):
    # Demo canaries + conservative patterns, NOT general PII detection. No logging.
    def inspect(text):
        normalized = unicodedata.normalize("NFKC", text).casefold()
        compact = re.sub(r"[^a-z0-9]", "", normalized)
        if any(fake in compact for fake in (
            "rahulsharma", "rahulexamplecom", "9876543210", "emp1024", "secret123"
        )) or (free_text and re.search(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bemp[\s_-]*\d+\b|(?:\d[\s()+.-]*){7,}", normalized)):
            raise ValueError("Unsafe context")

    if isinstance(value, dict):
        for key, child in value.items():
            inspect(str(key))
            reject_obvious_pii(child, key in {"goal", "text", "value"})
    elif isinstance(value, list):
        for child in value:
            reject_obvious_pii(child)
    elif isinstance(value, str):
        inspect(value)


class Dimensions(StrictModel):
    width: Positive
    height: Positive


class ImageMetadata(Dimensions):
    redactedRegions: Count


class Observation(StrictModel):
    id: ObservationId
    capturedAt: Annotated[str, Field(max_length=40)]
    viewport: Dimensions
    image: ImageMetadata
    coordinateSystem: Literal["screenshot-pixels"]

    @field_validator("capturedAt")
    @classmethod
    def valid_timestamp(cls, value):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("Timezone required")
        return value


class Privacy(StrictModel):
    status: Literal["safe"]
    sensitiveFieldCount: Count
    redactedRegionCount: Count
    rawPiiIncluded: bool

    @field_validator("rawPiiIncluded")
    @classmethod
    def no_raw_pii(cls, value):
        if value is not False:
            raise ValueError("Unsafe context")
        return value


class SemanticField(StrictModel):
    id: Annotated[str, Field(pattern=r"^field_[1-9][0-9]*$", max_length=50)]
    role: Literal["name", "email", "phone", "employee_id", "password", "destination", "purpose", "other"]
    sensitive: bool
    filled: bool
    value: Annotated[str, Field(max_length=100)]
    source: Literal["semantic"]

    @model_validator(mode="after")
    def safe_value(self):
        if self.sensitive != (self.role in SENSITIVE):
            raise ValueError("Invalid field policy")
        allowed = {f"[{self.role.upper()}]"} if self.sensitive else SAFE_VALUES.get(self.role, set()) | {"[WITHHELD]"}
        if self.value not in allowed:
            raise ValueError("Invalid safe value")
        return self


class Bbox(StrictModel):
    x: Annotated[float, Field(ge=0, le=100_000)]
    y: Annotated[float, Field(ge=0, le=100_000)]
    width: Positive
    height: Positive


class VisualElement(StrictModel):
    id: VisualId
    text: Annotated[str, Field(min_length=1, max_length=1000)]
    bbox: Bbox
    confidence: Annotated[float, Field(ge=0, le=1)] | None
    source: Literal["visual"]


class SafeAgentContext(StrictModel):
    schemaVersion: Literal[1]
    observation: Observation
    goal: Annotated[str, Field(max_length=500)]
    privacy: Privacy
    fields: Annotated[list[SemanticField], Field(max_length=200)]
    visualElements: Annotated[list[VisualElement], Field(max_length=1000)]
    actionCandidates: Annotated[list[VisualId], Field(max_length=1000)]
    redactionScheme: dict[str, str]

    @model_validator(mode="before")
    @classmethod
    def defensive_scan(cls, value):
        reject_obvious_pii(value)
        if isinstance(value, dict) and type(value.get("schemaVersion")) is not int:
            raise ValueError("Invalid schema version")
        return value

    @model_validator(mode="after")
    def coherent_context(self):
        for items in (self.fields, self.visualElements):
            if len({item.id for item in items}) != len(items):
                raise ValueError("Duplicate identity")
        sensitive = [field for field in self.fields if field.sensitive]
        if self.privacy.sensitiveFieldCount != len(sensitive) or self.privacy.redactedRegionCount != self.observation.image.redactedRegions:
            raise ValueError("Inconsistent privacy summary")
        if self.redactionScheme != {field.value: LEGEND[field.value] for field in sensitive}:
            raise ValueError("Invalid redaction scheme")
        for element in self.visualElements:
            box = element.bbox
            if box.x + box.width > self.observation.image.width or box.y + box.height > self.observation.image.height:
                raise ValueError("Visual box outside observation")
        # actionCandidates must be a duplicate-free subset of real visual ids: the
        # planner may only CLICK a genuine, locally-grounded actionable target.
        visual_ids = {element.id for element in self.visualElements}
        if len(set(self.actionCandidates)) != len(self.actionCandidates) or not set(self.actionCandidates) <= visual_ids:
            raise ValueError("Invalid action candidates")
        return self


class PlanResponse(StrictModel):
    schemaVersion: Literal[1] = 1
    observationId: ObservationId
    action: Literal["CLICK", "STOP"]
    target: VisualId | None
    reason: Annotated[str, Field(min_length=1, max_length=200)]

    @model_validator(mode="after")
    def target_policy(self):
        if (self.action == "CLICK") != (self.target is not None):
            raise ValueError("Invalid action target")
        return self
