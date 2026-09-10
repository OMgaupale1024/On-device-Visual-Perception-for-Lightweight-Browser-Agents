"""No Chrome claims: ASGI endpoint tests using the real Phase 5 serialized fixture."""
import copy
import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import PlanResponse
from pydantic import ValidationError

ORIGIN = "chrome-extension://" + "a" * 32
SECRETS = ["Rahul Sharma", "rahul@example.com", "9876543210", "EMP1024", "secret123"]


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app(ORIGIN))
        self.addCleanup(self.client.close)
        self.context = json.loads(Path(__file__).with_name("safe-context.json").read_text(encoding="utf-8"))

    def post(self):
        return self.client.post("/plan", json=self.context)

    def rejected(self):
        response = self.post()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"detail": "Invalid or unsafe agent context."})
        for secret in SECRETS:
            self.assertNotIn(secret, response.text)

    def test_health(self):
        self.assertEqual(self.client.get("/health").json(), {"status": "ok"})

    def test_valid_click_and_observation_binding(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        plan = response.json()
        self.assertEqual(plan, {"schemaVersion": 1, "observationId": self.context["observation"]["id"],
                               "action": "CLICK", "target": "visual_12",
                               "reason": "Required fields are filled and Continue is available."})
        PlanResponse.model_validate(plan)

    def test_invalid_schema(self):
        for version in [2, "1", True, 1.0, None]:
            with self.subTest(version=version):
                self.context["schemaVersion"] = version
                self.rejected()

    def test_goal_type_and_length(self):
        for goal in [42, None, {}, "x" * 501]:
            with self.subTest(kind=type(goal).__name__):
                self.context["goal"] = goal
                self.rejected()

    def test_raw_pii_flag_and_status(self):
        for flag in [True, "false", 0, None]:
            with self.subTest(flag=flag):
                self.context["privacy"]["rawPiiIncluded"] = flag
                self.rejected()
        self.context["privacy"]["rawPiiIncluded"] = False
        self.context["privacy"]["status"] = "unsafe"
        self.rejected()

    def test_known_pii_all_locations(self):
        original = copy.deepcopy(self.context)
        for index, secret in enumerate(SECRETS):
            for location in ["goal", "field", "visual", "metadata"]:
                with self.subTest(canary=index + 1, location=location):
                    self.context = copy.deepcopy(original)
                    if location == "goal":
                        self.context["goal"] = secret
                    elif location == "field":
                        self.context["fields"][5]["value"] = secret
                    elif location == "visual":
                        self.context["visualElements"][0]["text"] = secret
                    else:
                        self.context["observation"]["metadata"] = {"nested": secret}
                    self.rejected()

    def test_obvious_non_demo_pii(self):
        for text in ["someone@example.invalid", "+91 87654 32109", "EMP-9999", "RAHUL  SHARMA"]:
            with self.subTest(kind="pattern"):
                self.context["goal"] = text
                self.rejected()

    def test_missing_observation_id(self):
        del self.context["observation"]["id"]
        self.rejected()

    def test_invalid_observation_metadata(self):
        for key, value in [("id", "bad"), ("capturedAt", "yesterday"), ("coordinateSystem", "CSS")]:
            old = self.context["observation"][key]
            self.context["observation"][key] = value
            self.rejected()
            self.context["observation"][key] = old

    def test_invalid_bbox(self):
        original = copy.deepcopy(self.context["visualElements"][0]["bbox"])
        for key, value in [("x", -1), ("x", "1"), ("x", True), ("width", 0), ("height", -1), ("x", 799)]:
            with self.subTest(key=key, value=value):
                self.context["visualElements"][0]["bbox"] = {**original, key: value}
                self.rejected()
        self.context["visualElements"][0]["bbox"] = {"x": 0}
        self.rejected()

    def test_invalid_confidence(self):
        for confidence in [-0.1, 1.1, "0.5", True]:
            with self.subTest(confidence=confidence):
                self.context["visualElements"][0]["confidence"] = confidence
                self.rejected()

    def test_null_confidence_preserves_phase5_contract(self):
        self.context["visualElements"][0]["confidence"] = None
        self.assertEqual(self.post().status_code, 200)

    def test_forbidden_and_unknown_keys(self):
        original = copy.deepcopy(self.context)
        for key in ["rawScreenshot", "rawOCR", "rawDOM", "password", "secret", "unexpected"]:
            for location in ["root", "image", "field", "visual", "privacy"]:
                with self.subTest(key=key, location=location):
                    self.context = copy.deepcopy(original)
                    target = {"root": self.context, "image": self.context["observation"]["image"],
                              "field": self.context["fields"][0], "visual": self.context["visualElements"][0],
                              "privacy": self.context["privacy"]}[location]
                    target[key] = "forbidden"
                    self.rejected()

    def test_redaction_and_sensitive_policy(self):
        original = copy.deepcopy(self.context)
        for location in ["legend", "value", "sensitive", "count", "image_count"]:
            self.context = copy.deepcopy(original)
            if location == "legend": self.context["redactionScheme"]["[NAME]"] = "wrong"
            if location == "value": self.context["fields"][0]["value"] = "unrecognized person"
            if location == "sensitive": self.context["fields"][0]["sensitive"] = False
            if location == "count": self.context["privacy"]["sensitiveFieldCount"] = 0
            if location == "image_count": self.context["observation"]["image"]["redactedRegions"] = 0
            self.rejected()

    def test_duplicate_ids(self):
        for key in ["fields", "visualElements"]:
            self.context[key].append(copy.deepcopy(self.context[key][0]))
            self.rejected()
            self.context[key].pop()

    def test_stop_without_continue(self):
        self.context["visualElements"] = []
        response = self.post().json()
        self.assertEqual(response["action"], "STOP")
        self.assertIsNone(response["target"])
        self.assertEqual(response["observationId"], self.context["observation"]["id"])

    def test_stop_ambiguous_continue(self):
        element = copy.deepcopy(self.context["visualElements"][0])
        element["id"] = "visual_13"
        self.context["visualElements"].append(element)
        self.assertEqual(self.post().json()["action"], "STOP")

    def test_stop_each_incomplete_field(self):
        for field in self.context["fields"]:
            field["filled"] = False
            self.assertEqual(self.post().json()["action"], "STOP")
            field["filled"] = True

    def test_stop_missing_role_withheld_and_unsupported_goal(self):
        original = copy.deepcopy(self.context)
        self.context["fields"].pop()
        self.assertEqual(self.post().json()["action"], "STOP")
        self.context = copy.deepcopy(original)
        self.context["fields"][5]["value"] = "[WITHHELD]"
        self.assertEqual(self.post().json()["action"], "STOP")
        self.context = original
        self.context["goal"] = "Do something else"
        self.assertEqual(self.post().json()["action"], "STOP")

    def test_target_always_supplied_and_observation_echoed(self):
        for i in range(1, 15):
            self.context["visualElements"][0]["id"] = f"visual_{i}"
            self.context["observation"]["id"] = f"obs_case-{i}"
            plan = self.post().json()
            self.assertEqual(plan["target"], f"visual_{i}")
            self.assertEqual(plan["observationId"], f"obs_case-{i}")

    def test_response_model_rejects_action_and_arbitrary_geometry(self):
        plan = self.post().json()
        for changes in [{"action": "TYPE"}, {"target": None}, {"x": 1}, {"selector": "#continue"}]:
            with self.assertRaises(ValidationError):
                PlanResponse.model_validate({**plan, **changes})

    def test_invalid_json_nonfinite_and_missing_body(self):
        for body in ['{"goal":', '{"schemaVersion":NaN}', 'null', '{}']:
            response = self.client.post("/plan", content=body, headers={"Content-Type": "application/json"})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json(), {"detail": "Invalid or unsafe agent context."})

    def test_cors_exact_origin_only(self):
        headers = {"Origin": ORIGIN, "Access-Control-Request-Method": "POST",
                   "Access-Control-Request-Headers": "Content-Type"}
        response = self.client.options("/plan", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], ORIGIN)
        self.assertNotIn("access-control-allow-credentials", response.headers)
        for origin in ["https://example.com", "null", "chrome-extension://" + "b" * 32]:
            headers["Origin"] = origin
            self.assertEqual(self.client.options("/plan", headers=headers).status_code, 400)
            self.assertEqual(self.client.post("/plan", headers={"Origin": origin}, json=self.context).status_code, 403)

    def test_no_wildcard_or_implicit_dev_origin(self):
        with self.assertRaises(ValueError): create_app("*")
        with TestClient(create_app("")) as client:
            self.assertEqual(client.get("/health", headers={"Origin": ORIGIN}).status_code, 403)
            self.assertEqual(client.get("/health").status_code, 200)


if __name__ == "__main__":
    unittest.main()
