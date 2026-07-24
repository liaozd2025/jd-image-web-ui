from __future__ import annotations

from pathlib import Path
import subprocess
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_COMPOSE = ROOT / "deploy" / "server" / "compose.production.yml"
DEPLOY_SCRIPT = ROOT / "deploy" / "server" / "deploy.sh"
BUILD_SCRIPT = ROOT / "scripts" / "build-release.sh"


class ProductionDeployTests(unittest.TestCase):
    def test_shell_scripts_are_valid_bash_and_expose_help(self) -> None:
        for script in (DEPLOY_SCRIPT, BUILD_SCRIPT):
            syntax = subprocess.run(
                ["bash", "-n", str(script)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(syntax.returncode, 0, syntax.stderr)
            help_result = subprocess.run(
                [str(script), "--help"],
                check=False,
                capture_output=True,
                text=True,
                cwd=ROOT,
            )
            self.assertEqual(help_result.returncode, 0, help_result.stderr)
            self.assertIn("Usage:", help_result.stdout)

    def test_production_compose_uses_only_explicit_host_bind_mounts(self) -> None:
        document = yaml.safe_load(PRODUCTION_COMPOSE.read_text(encoding="utf-8"))
        services = document["services"]

        self.assertNotIn("volumes", document)
        self.assertNotIn("build", services["web"])
        self.assertNotIn("build", services["worker"])
        self.assertEqual(services["web"]["image"], "${JD_IMAGE_APP_IMAGE:?JD_IMAGE_APP_IMAGE is required}")
        self.assertEqual(services["worker"]["image"], "${JD_IMAGE_APP_IMAGE:?JD_IMAGE_APP_IMAGE is required}")

        expected_sources = {
            "postgres": {"${JD_IMAGE_POSTGRES_DIR:?JD_IMAGE_POSTGRES_DIR is required}"},
            "web": {
                "${JD_IMAGE_DATA_DIR:?JD_IMAGE_DATA_DIR is required}",
                "${JD_IMAGE_BACKUP_DIR:?JD_IMAGE_BACKUP_DIR is required}",
            },
            "worker": {"${JD_IMAGE_DATA_DIR:?JD_IMAGE_DATA_DIR is required}"},
            "proxy": {"./nginx.conf"},
        }
        for service_name, sources in expected_sources.items():
            mounts = services[service_name]["volumes"]
            self.assertTrue(all(mount["type"] == "bind" for mount in mounts))
            self.assertEqual({mount["source"] for mount in mounts}, sources)

        self.assertNotIn("ports", services["postgres"])
        self.assertNotIn("ports", services["web"])
        self.assertNotIn("ports", services["worker"])
        self.assertEqual(
            services["proxy"]["ports"],
            ["${JD_IMAGE_HTTP_BIND:-0.0.0.0}:${JD_IMAGE_HTTP_PORT:-8787}:80"],
        )

    def test_release_builder_pins_amd64_base_images_and_rejects_dirty_builds(self) -> None:
        source = BUILD_SCRIPT.read_text(encoding="utf-8")
        self.assertIn('readonly TARGET_PLATFORM="linux/amd64"', source)
        self.assertRegex(source, r'PYTHON_BASE_IMAGE="[^"]+@sha256:[0-9a-f]{64}"')
        self.assertRegex(source, r'POSTGRES_IMAGE="[^"]+@sha256:[0-9a-f]{64}"')
        self.assertRegex(source, r'NGINX_IMAGE="[^"]+@sha256:[0-9a-f]{64}"')
        self.assertIn("status --porcelain", source)
        self.assertIn("Git worktree is not clean", source)
        self.assertIn('docker save \\\n    --output "${bundle_dir}/base-images.tar"', source)

    def test_deployer_preserves_secrets_and_separates_install_from_upgrade(self) -> None:
        source = DEPLOY_SCRIPT.read_text(encoding="utf-8")
        self.assertIn('DEFAULT_DEPLOY_ROOT="/srv/jd-image-web-ui"', source)
        self.assertIn("JD_IMAGE_MASTER_KEY=", source)
        self.assertIn("Reusing existing configuration from an incomplete installation.", source)
        self.assertIn("a deployment is already installed; use the upgrade command", source)
        self.assertIn("existing deployment configuration is missing", source)
        self.assertIn("--http-port is valid only for install", source)
        self.assertIn('docker load --input "${SCRIPT_DIR}/base-images.tar"', source)
        self.assertNotIn("docker pull", source)
        self.assertNotIn("docker compose down --volumes", source)
        self.assertNotIn("docker volume rm", source)


if __name__ == "__main__":
    unittest.main()
