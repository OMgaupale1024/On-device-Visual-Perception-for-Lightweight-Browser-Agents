"""Strict Phase 5 wire contract. Local sanitization remains the primary boundary."""
import re
import unicodedata
from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator, model_serializer


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
    role: Literal["button", "link", "input", "searchbox", "textarea"] | None = None
    editable: bool = False
    focused: bool = False

    @model_validator(mode="after")
    def editable_role(self):
        if self.editable and self.role not in {"input", "searchbox", "textarea"}:
            raise ValueError("Invalid editable role")
        return self


class SafeAgentContext(StrictModel):
    schemaVersion: Literal[1]
    observation: Observation
    goal: Annotated[str, Field(max_length=500)]
    pageOrigin: Annotated[str, Field(max_length=2048)] | None = None
    privacy: Privacy
    fields: Annotated[list[SemanticField], Field(max_length=200)]
    visualElements: Annotated[list[VisualElement], Field(max_length=1000)]
    actionCandidates: Annotated[list[VisualId], Field(max_length=1000)]
    redactionScheme: dict[str, str]

    @field_validator("pageOrigin")
    @classmethod
    def origin_only(cls, value):
        if value is None:
            return value
        parsed = urlsplit(navigation_url(value))
        if parsed.path != "/" or parsed.query or parsed.fragment:
            raise ValueError("Origin only")
        return f"{parsed.scheme}://{parsed.netloc}"

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


ACTION_FIELDS = {"CLICK": {"target"}, "TYPE": {"target", "text"},
                 "PRESS_KEY": {"key"}, "SCROLL": {"direction", "amount"},
                 "NAVIGATE": {"url"}, "STOP": set()}


def navigation_url(value: str) -> str:
    if (not isinstance(value, str) or len(value) > 2048 or
            re.search(r"[\s\\\x00-\x1f\x7f]", value) or "%0" in value.lower()):
        raise ValueError("Invalid navigation URL")
    parts = urlsplit(value)
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname or parts.username is not None or parts.password is not None:
        raise ValueError("Invalid navigation URL")
    # Accessing port also rejects malformed/non-numeric/out-of-range ports.
    port = parts.port
    host = parts.hostname.encode("idna").decode("ascii").lower()
    if ":" in host:
        host = f"[{host}]"
    if not re.fullmatch(r"[a-z0-9.\-\[\]:]+", host):
        raise ValueError("Invalid navigation URL")
    scheme = parts.scheme.lower()
    netloc = host + (f":{port}" if port and port != (443 if scheme == "https" else 80) else "")
    reject_obvious_pii(value, free_text=True)
    return urlunsplit((scheme, netloc, parts.path or "/", parts.query, parts.fragment))


class ActionPayload(StrictModel):
    """One canonical action union, shared by model parsing and HTTP responses."""
    action: Literal["CLICK", "TYPE", "PRESS_KEY", "SCROLL", "NAVIGATE", "STOP"]
    target: VisualId | None = None
    text: Annotated[str, Field(min_length=1, max_length=500)] | None = None
    key: Literal["ENTER"] | None = None
    direction: Literal["UP", "DOWN"] | None = None
    amount: Literal["SMALL", "MEDIUM", "LARGE"] | None = None
    url: str | None = None

    @model_validator(mode="before")
    @classmethod
    def action_fields(cls, value):
        if not isinstance(value, dict) or value.get("action") not in ACTION_FIELDS:
            raise ValueError("Invalid action")
        allowed = ACTION_FIELDS[value["action"]]
        for key in {"target", "text", "key", "direction", "amount", "url"}:
            if key in allowed:
                if value.get(key) is None:
                    raise ValueError("Missing action parameter")
            elif key in value and not (value["action"] == "STOP" and key == "target" and value[key] is None):
                raise ValueError("Irrelevant action parameter")
        return value

    @model_validator(mode="after")
    def parameter_policy(self):
        if self.action == "TYPE":
            if not self.text.strip() or any(ord(c) < 32 or ord(c) == 127 for c in self.text):
                raise ValueError("Invalid task text")
            reject_obvious_pii(self.text, free_text=True)
        if self.action == "NAVIGATE":
            self.url = navigation_url(self.url)
        return self

    @model_serializer(mode="wrap")
    def serialize_action(self, handler):
        result = handler(self)
        for key in {"target", "text", "key", "direction", "amount", "url"} - ACTION_FIELDS[self.action]:
            result.pop(key, None)
        if self.action == "STOP":
            result["target"] = None  # Preserve the existing CLICK/STOP wire contract.
        return result


class PlanResponse(ActionPayload):
    schemaVersion: Literal[1] = 1
    observationId: ObservationId
    reason: Annotated[str, Field(min_length=1, max_length=200)]
