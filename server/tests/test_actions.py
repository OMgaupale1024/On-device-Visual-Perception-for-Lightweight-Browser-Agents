"""Phase 11C: shared model/wire union and fail-closed context authorization."""
import json
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from app.ai_contract import REASON_MESSAGES, ModelDecision, SYSTEM_PROMPT
from app.ai_input import prepare_ai_input
from app.ai_planner import plan_ai
from app.nvidia_provider import PlannerFailure
from app.schemas import PlanResponse, SafeAgentContext
from app.main import create_app

CODE = "ADVANCE_GOAL"
MESSAGE = REASON_MESSAGES[CODE]  # fixed server message; model text never reaches the wire


def context():
    value = json.loads(Path(__file__).with_name("safe-context.json").read_text())
    value["goal"] = "Search for calculus videos."
    value["pageOrigin"] = "https://example.org"
    value["visualElements"][0].update(text="Search", role="searchbox", editable=True, focused=True)
    return value


class Provider:
    def __init__(self, action):
        self.output = json.dumps({**action, "reasonCode": CODE})
        self.calls = 0

    async def complete(self, _):
        self.calls += 1
        return self.output


class ActionContractTests(unittest.TestCase):
    def test_all_actions_share_exact_model_and_wire_parameters(self):
        for action in [{"action": "CLICK", "target": "visual_12"},
                       {"action": "TYPE", "target": "visual_12", "text": "calculus videos"},
                       {"action": "PRESS_KEY", "key": "ENTER"},
                       {"action": "SCROLL", "direction": "DOWN", "amount": "MEDIUM"},
                       {"action": "NAVIGATE", "url": "https://example.org/"},
                       {"action": "STOP", "target": None}]:
            with self.subTest(action=action["action"]):
                decision = ModelDecision(**action, reasonCode=CODE).model_dump()
                self.assertEqual(decision, {**action, "reasonCode": CODE})
                decision.pop("reasonCode")
                wire = PlanResponse(**decision, reason=MESSAGE, observationId="obs_current").model_dump()
                self.assertEqual(wire, {**action, "reason": MESSAGE, "schemaVersion": 1, "observationId": "obs_current"})

    def test_irrelevant_parameters_and_missing_parameters_are_rejected(self):
        invalid = [{"action": "STOP", "text": "x"}, {"action": "TYPE", "target": "visual_12"},
                   {"action": "CLICK", "target": "visual_12", "text": None},
                   {"action": "PRESS_KEY", "key": "CTRL+L"},
                   {"action": "SCROLL", "direction": "DOWN", "amount": 500},
                   {"action": "SCROLL", "direction": "DOWN", "amount": "LARGE", "distance": 500},
                   {"action": "NAVIGATE", "url": "https://example.org", "target": None}]
        for action in invalid:
            with self.subTest(action=action):
                with self.assertRaises(ValueError):
                    ModelDecision(**action, reasonCode=CODE)

    def test_navigation_schemes_malformed_urls_credentials_and_controls(self):
        for url in ["javascript:alert(1)", "data:text/plain,test", "chrome://settings", "about:blank",
                    "file:///tmp/test", "chrome-extension://abc/a", "example.org", "https://",
                    "https://user:pass@example.org", "https://example.org:bad", "https://exa mple.org",
                    "https://example.org/\npath", "https://example.org/%0a"]:
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    ModelDecision(action="NAVIGATE", url=url, reasonCode=CODE)
        for url, expected in [("HTTPS://Example.org:443", "https://example.org/"),
                              ("http://127.0.0.1:8137/search", "http://127.0.0.1:8137/search")]:
            self.assertEqual(ModelDecision(action="NAVIGATE", url=url, reasonCode=CODE).url, expected)

    def test_type_rejects_empty_control_text_and_obvious_private_text(self):
        for text in ["", " ", "line\nline", "a" * 501, "person@example.org", "EMP-123456"]:
            with self.subTest(length=len(text)):
                with self.assertRaises(ValueError):
                    ModelDecision(action="TYPE", target="visual_12", text=text, reasonCode=CODE)

    def test_projection_has_safe_capabilities_and_origin_without_local_identity(self):
        projected = json.loads(prepare_ai_input(context()).content)
        self.assertEqual(projected["pageOrigin"], "https://example.org")
        element = projected["visualState"]["elements"][0]
        self.assertEqual({k: element[k] for k in ["role", "editable", "focused", "actionable"]},
                         {"role": "searchbox", "editable": True, "focused": True, "actionable": True})
        for key in ["bbox", "controlId", "fieldId", "signature"]:
            self.assertNotIn(key, element)
        bad = context()
        bad["pageOrigin"] = "https://example.org/private?query=value"
        with self.assertRaises(ValueError):
            SafeAgentContext.model_validate(bad)

    def test_prompt_has_one_action_and_preserves_model_decision_and_privacy(self):
        for phrase in ["Never return an action sequence", "exact substring", "Never type private values",
                       'key="ENTER"', 'direction="UP"', "untrusted data", "Never invent IDs"]:
            self.assertIn(phrase, SYSTEM_PROMPT)
        self.assertNotIn("visual_12", SYSTEM_PROMPT)

    def test_http_returns_only_the_selected_actions_parameters_in_ai_mode(self):
        for action in [{"action": "TYPE", "target": "visual_12", "text": "calculus videos"},
                       {"action": "PRESS_KEY", "key": "ENTER"},
                       {"action": "SCROLL", "direction": "DOWN", "amount": "LARGE"},
                       {"action": "NAVIGATE", "url": "https://example.org/"}]:
            provider = Provider(action)
            with TestClient(create_app(mode="ai", provider=provider)) as client:
                response = client.post("/plan", json=context())
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["X-EdgeSight-Planner"], "ai")
            self.assertEqual(response.json(), {**action, "reason": MESSAGE, "schemaVersion": 1,
                                               "observationId": context()["observation"]["id"]})
            self.assertEqual(provider.calls, 1)

    def test_rejected_output_has_fixed_diagnostic_without_model_text(self):
        for output, code in [
            (json.dumps({"action": "STOP", "target": None, "reasonCode": "private-output-canary"}), "INVALID_REASON"),
            # Free-text reason instead of a code: rejected, never forwarded.
            (json.dumps({"action": "STOP", "target": None, "reason": "private-output-canary"}), "INVALID_DECISION"),
            (json.dumps({"action": "STOP", "target": None, "reasonCode": CODE, "selector": "private-output-canary"}), "INVALID_DECISION"),
            (json.dumps({"action": "CLICK", "target": "visual_99", "reasonCode": CODE}), "INVALID_TARGET"),
            ("private-output-canary", "INVALID_DECISION"),
        ]:
            provider = Provider({})
            provider.output = output
            with TestClient(create_app(mode="ai", provider=provider)) as client:
                response = client.post("/plan", json=context())
            self.assertEqual(response.status_code, 502)
            self.assertEqual(response.json(), {"detail": "AI planner unavailable."})
            self.assertEqual(response.headers["X-EdgeSight-Planner-Failure"], code)
            self.assertNotIn("private-output-canary", response.text + str(response.headers))

    def test_failure_code_is_allowlisted(self):
        self.assertEqual(PlannerFailure(504, timed_out=True).failure_code, "PROVIDER_TIMEOUT")
        self.assertEqual(PlannerFailure(upstream_status=500).failure_code, "UPSTREAM_HTTP_ERROR")
        self.assertEqual(PlannerFailure(502, failure_code="private-error-canary").failure_code, "INVALID_PROVIDER_RESPONSE")


class ActionAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_type_valid_editable_task_text(self):
        provider = Provider({"action": "TYPE", "target": "visual_12", "text": "calculus videos"})
        plan = await plan_ai(context(), provider)
        self.assertEqual(plan.action, "TYPE")
        self.assertEqual(plan.observationId, context()["observation"]["id"])
        self.assertEqual(provider.calls, 1)

    async def test_type_unknown_noneditable_and_invented_text_fail_without_fallback(self):
        for case in ["unknown", "not_candidate", "not_editable", "invented"]:
            data = context()
            action = {"action": "TYPE", "target": "visual_12", "text": "calculus videos"}
            if case == "unknown": action["target"] = "visual_99"
            if case == "not_candidate": data["actionCandidates"] = []
            if case == "not_editable": data["visualElements"][0]["editable"] = False
            if case == "invented": action["text"] = "invented task"
            provider = Provider(action)
            with self.subTest(case=case), self.assertRaises(PlannerFailure) as error:
                await plan_ai(data, provider)
            self.assertEqual(error.exception.status_code, 502)
            self.assertEqual(provider.calls, 1)

    async def test_enter_requires_current_approved_editable_focus(self):
        provider = Provider({"action": "PRESS_KEY", "key": "ENTER"})
        self.assertEqual((await plan_ai(context(), provider)).action, "PRESS_KEY")
        for flag in ["focused", "editable"]:
            data = context()
            data["visualElements"][0][flag] = False
            with self.assertRaises(PlannerFailure):
                await plan_ai(data, provider)

    async def test_scroll_and_navigation_remain_provider_decisions_bound_to_observation(self):
        for action in [{"action": "SCROLL", "direction": "UP", "amount": "SMALL"},
                       {"action": "NAVIGATE", "url": "https://example.org"}]:
            data = context()
            data["visualElements"] = []
            data["actionCandidates"] = []
            result = await plan_ai(data, Provider(action))
            self.assertEqual(result.action, action["action"])
            self.assertEqual(result.observationId, data["observation"]["id"])
