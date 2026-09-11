"""Timing metadata never changes the safe action schema or echoes page strings."""
import json
from pathlib import Path
import re
import unittest
from fastapi.testclient import TestClient
from app.main import create_app


class TimingTests(unittest.TestCase):
    def test_numeric_headers_and_unchanged_body(self):
        origin = "chrome-extension://" + "a" * 32
        fixture = json.loads((Path(__file__).parent / "safe-context.json").read_text())
        with TestClient(create_app(origin, mode="deterministic")) as client:
            response = client.post("/plan", json=fixture, headers={"Origin": origin})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {"schemaVersion", "observationId", "action", "target", "reason"})
        self.assertRegex(response.headers["server-timing"], r"^prehandler;dur=\d+\.\d{3}, planner;dur=\d+\.\d{3}$")
        self.assertIn("Server-Timing", response.headers["access-control-expose-headers"])
        self.assertTrue(all(float(v) >= 0 for v in re.findall(r"dur=([\d.]+)", response.headers["server-timing"])))

    def test_invalid_input_never_echoes_values_as_metrics(self):
        with TestClient(create_app(mode="deterministic")) as client:
            response = client.post("/plan", json={"goal": "synthetic-private-canary"})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("synthetic-private-canary", response.text + str(response.headers))
        self.assertNotIn("server-timing", response.headers)
