"""Unit tests for staff Sandbox ask helpers."""

from __future__ import annotations

import unittest

from tis_agent.sandbox_api import normalize_history


class SandboxApiTests(unittest.TestCase):
    def test_normalize_history_keeps_user_assistant(self) -> None:
        history = normalize_history(
            [
                {"role": "user", "content": "Buses?"},
                {"role": "assistant", "content": "See handbook."},
                {"role": "system", "content": "ignore"},
                {"role": "user", "content": "  "},
                "bad",
            ]
        )
        self.assertEqual(
            history,
            [
                {"role": "user", "content": "Buses?"},
                {"role": "assistant", "content": "See handbook."},
            ],
        )

    def test_normalize_history_empty(self) -> None:
        self.assertEqual(normalize_history(None), [])
        self.assertEqual(normalize_history({}), [])


if __name__ == "__main__":
    unittest.main()
