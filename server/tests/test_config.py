"""Non-secret startup configuration; no credentials or provider network."""
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


class ProviderTimeoutConfigTests(unittest.TestCase):
    def load_config(self, env):
        # Isolate startup evaluation without reloading modules used by other tests.
        with patch.dict("os.environ", env, clear=True):
            return runpy.run_path(str(Path(__file__).parents[1] / "app" / "config.py"))

    def test_default_timeout_is_30_seconds(self):
        self.assertEqual(self.load_config({})["PROVIDER_TIMEOUT_SECONDS"], 30.0)

    def test_valid_overrides_including_bounds_and_fraction(self):
        for value in ["1", "25.5", "30", "120"]:
            with self.subTest(value=value):
                config = self.load_config({"NVIDIA_TIMEOUT_SECONDS": value})
                self.assertEqual(config["PROVIDER_TIMEOUT_SECONDS"], float(value))

    def test_invalid_timeout_rejected_without_echoing_input(self):
        for value in ["0", "-1", "0.9", "120.1", "999999", "NaN", "inf", "-inf", "1e309", "", "invalid-setting"]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError) as error:
                    self.load_config({"NVIDIA_TIMEOUT_SECONDS": value})
                self.assertEqual(str(error.exception),
                                 "NVIDIA_TIMEOUT_SECONDS must be a finite number from 1 to 120")
