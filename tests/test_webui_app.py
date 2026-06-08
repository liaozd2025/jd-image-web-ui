"""Compatibility entry for WebUI backend tests.

Domain-specific tests live in ``tests/test_webui_generation.py``,
``tests/test_webui_gallery.py``, ``tests/test_webui_queue.py``,
``tests/test_webui_tasks.py``, and ``tests/test_webui_settings.py``.
"""

from __future__ import annotations

import unittest


_DOMAIN_MODULES = (
    "tests.test_webui_generation",
    "tests.test_webui_gallery",
    "tests.test_webui_queue",
    "tests.test_webui_tasks",
    "tests.test_webui_settings",
)


def load_tests(loader: unittest.TestLoader, standard_tests: unittest.TestSuite, pattern: str | None) -> unittest.TestSuite:
    if pattern is not None:
        return unittest.TestSuite()
    suite = unittest.TestSuite()
    for module_name in _DOMAIN_MODULES:
        suite.addTests(loader.loadTestsFromName(module_name))
    return suite
