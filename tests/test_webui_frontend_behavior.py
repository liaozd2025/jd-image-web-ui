from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


class WebUIFrontendBehaviorTests(unittest.TestCase):
    def test_segmented_indicator_initial_position_behavior(self) -> None:
        node = shutil.which("node")
        esbuild = Path("node_modules/.bin/esbuild")
        if node is None or not esbuild.exists():
            self.skipTest("node and npm install are required for frontend behavior tests")

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "segmented-indicator-behavior.test.mjs"
            build = subprocess.run(
                [
                    str(esbuild),
                    "tests/frontend/segmented_indicator_behavior.test.ts",
                    "--bundle",
                    "--platform=node",
                    "--format=esm",
                    "--target=node20",
                    f"--outfile={output}",
                    "--log-level=warning",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(build.returncode, 0, build.stderr)
            result = subprocess.run(
                [node, "--test", str(output)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_task_model_summary_behavior(self) -> None:
        node = shutil.which("node")
        esbuild = Path("node_modules/.bin/esbuild")
        if node is None or not esbuild.exists():
            self.skipTest("node and npm install are required for frontend behavior tests")

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "task-model-summary.test.mjs"
            build = subprocess.run(
                [
                    str(esbuild),
                    "tests/frontend/task_model_summary.test.ts",
                    "--bundle",
                    "--platform=node",
                    "--format=esm",
                    "--target=node20",
                    f"--outfile={output}",
                    "--log-level=warning",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(build.returncode, 0, build.stderr)
            result = subprocess.run(
                [node, "--test", str(output)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_provider_binding_editor_behavior(self) -> None:
        node = shutil.which("node")
        esbuild = Path("node_modules/.bin/esbuild")
        if node is None or not esbuild.exists():
            self.skipTest("node and npm install are required for frontend behavior tests")

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "provider-binding-editor.test.mjs"
            build = subprocess.run(
                [
                    str(esbuild),
                    "tests/frontend/provider_binding_editor.test.ts",
                    "--bundle",
                    "--platform=node",
                    "--format=esm",
                    "--target=node20",
                    f"--outfile={output}",
                    "--log-level=warning",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(build.returncode, 0, build.stderr)
            result = subprocess.run(
                [node, "--test", str(output)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_model_provider_selection_behavior(self) -> None:
        node = shutil.which("node")
        esbuild = Path("node_modules/.bin/esbuild")
        if node is None or not esbuild.exists():
            self.skipTest("node and npm install are required for frontend behavior tests")

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "model-provider-behavior.test.mjs"
            build = subprocess.run(
                [
                    str(esbuild),
                    "tests/frontend/model_provider_behavior.test.ts",
                    "--bundle",
                    "--platform=node",
                    "--format=esm",
                    "--target=node20",
                    f"--outfile={output}",
                    "--log-level=warning",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(build.returncode, 0, build.stderr)
            result = subprocess.run(
                [node, "--test", str(output)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
