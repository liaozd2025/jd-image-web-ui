from __future__ import annotations

import hashlib
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_COMPOSE = ROOT / "deploy" / "server" / "compose.production.yml"
DEPLOY_SCRIPT = ROOT / "deploy" / "server" / "deploy.sh"
BUILD_SCRIPT = ROOT / "scripts" / "build-release.sh"
UPDATE_BUILD_SCRIPT = ROOT / "scripts" / "build-update-package.sh"
UPDATE_COMPOSE = ROOT / "deploy" / "server" / "compose.update.yml"


class ProductionDeployTests(unittest.TestCase):
    def test_shell_scripts_are_valid_bash_and_expose_help(self) -> None:
        for script in (DEPLOY_SCRIPT, BUILD_SCRIPT, UPDATE_BUILD_SCRIPT):
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

    def test_update_compose_only_overlays_read_only_application_code(self) -> None:
        document = yaml.safe_load(UPDATE_COMPOSE.read_text(encoding="utf-8"))

        self.assertEqual(set(document["services"]), {"web", "worker"})
        for service_name in ("web", "worker"):
            self.assertNotIn("image", document["services"][service_name])
            self.assertNotIn("build", document["services"][service_name])
            self.assertEqual(
                document["services"][service_name]["volumes"],
                [
                    {
                        "type": "bind",
                        "source": "${JD_IMAGE_APP_PACKAGE_DIR:?JD_IMAGE_APP_PACKAGE_DIR is required}",
                        "target": "/app/codex_image",
                        "read_only": True,
                    }
                ],
            )

    def test_update_compose_clears_docker_client_proxies_for_application_services(self) -> None:
        document = yaml.safe_load(UPDATE_COMPOSE.read_text(encoding="utf-8"))
        expected_proxy_environment = {
            "HTTP_PROXY": "",
            "HTTPS_PROXY": "",
            "ALL_PROXY": "",
            "NO_PROXY": "",
            "http_proxy": "",
            "https_proxy": "",
            "all_proxy": "",
            "no_proxy": "",
        }

        for service_name in ("web", "worker"):
            self.assertEqual(
                document["services"][service_name]["environment"],
                expected_proxy_environment,
            )

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

    def test_production_application_services_do_not_inherit_docker_client_proxies(self) -> None:
        document = yaml.safe_load(PRODUCTION_COMPOSE.read_text(encoding="utf-8"))
        expected_proxy_environment = {
            "HTTP_PROXY": "",
            "HTTPS_PROXY": "",
            "ALL_PROXY": "",
            "NO_PROXY": "",
            "http_proxy": "",
            "https_proxy": "",
            "all_proxy": "",
            "no_proxy": "",
        }

        for service_name in ("web", "worker"):
            environment = document["services"][service_name]["environment"]
            for variable_name, expected_value in expected_proxy_environment.items():
                with self.subTest(service=service_name, variable=variable_name):
                    self.assertIn(variable_name, environment)
                    self.assertEqual(environment[variable_name], expected_value)

    def test_release_builder_pins_amd64_base_images_and_rejects_dirty_builds(self) -> None:
        source = BUILD_SCRIPT.read_text(encoding="utf-8")
        self.assertIn('readonly TARGET_PLATFORM="linux/amd64"', source)
        self.assertRegex(source, r'PYTHON_BASE_IMAGE="[^"]+@sha256:[0-9a-f]{64}"')
        self.assertRegex(source, r'POSTGRES_SOURCE_IMAGE="[^"]+@sha256:[0-9a-f]{64}"')
        self.assertRegex(source, r'NGINX_SOURCE_IMAGE="[^"]+@sha256:[0-9a-f]{64}"')
        self.assertIn('POSTGRES_BUNDLED_IMAGE="jd-image-web-ui/postgres:', source)
        self.assertIn('NGINX_BUNDLED_IMAGE="jd-image-web-ui/nginx:', source)
        self.assertIn("status --porcelain", source)
        self.assertIn("Git worktree is not clean", source)
        self.assertIn('docker tag "${POSTGRES_SOURCE_IMAGE}" "${POSTGRES_BUNDLED_IMAGE}"', source)
        self.assertIn('docker tag "${NGINX_SOURCE_IMAGE}" "${NGINX_BUNDLED_IMAGE}"', source)
        self.assertIn('docker save \\\n    --output "${bundle_dir}/base-images.tar"', source)

    def test_update_builder_creates_code_only_bundle_from_clean_git_commit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository = Path(temporary_directory) / "repository"
            repository.mkdir()
            for source in (
                ROOT / "codex_image",
                ROOT / "deploy",
                ROOT / "requirements-server.txt",
                UPDATE_BUILD_SCRIPT,
            ):
                relative = source.relative_to(ROOT)
                destination = repository / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                if source.is_dir():
                    shutil.copytree(source, destination)
                else:
                    shutil.copy2(source, destination)

            subprocess.run(["git", "init", "-q"], cwd=repository, check=True)
            subprocess.run(["git", "config", "user.name", "Production Deploy Test"], cwd=repository, check=True)
            subprocess.run(
                ["git", "config", "user.email", "production-deploy-test@example.invalid"],
                cwd=repository,
                check=True,
            )
            subprocess.run(["git", "add", "."], cwd=repository, check=True)
            subprocess.run(["git", "commit", "-qm", "test fixture"], cwd=repository, check=True)

            output_directory = repository / "dist"
            result = subprocess.run(
                [
                    str(repository / "scripts" / "build-update-package.sh"),
                    "--version",
                    "v9.8.7",
                    "--output",
                    str(output_directory),
                ],
                cwd=repository,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

            archive = output_directory / "jd-image-web-ui-v9.8.7-program-update.tar.gz"
            self.assertTrue(archive.is_file())
            with tarfile.open(archive, "r:gz") as outer:
                bundle_root = "jd-image-web-ui-v9.8.7-program-update"
                outer_members = outer.getmembers()
                names = {member.name for member in outer_members}
                expected_files = {
                    f"{bundle_root}/app-package.tar.gz",
                    f"{bundle_root}/compose.update.yml",
                    f"{bundle_root}/deploy.sh",
                    f"{bundle_root}/manifest.txt",
                    f"{bundle_root}/README.md",
                    f"{bundle_root}/requirements-server.txt",
                    f"{bundle_root}/update.env",
                }
                self.assertTrue(expected_files.issubset(names))
                self.assertFalse(any(name.endswith(("app-image.tar", "base-images.tar")) for name in names))

                package_member = outer.extractfile(f"{bundle_root}/app-package.tar.gz")
                self.assertIsNotNone(package_member)
                package_bytes = package_member.read()
                manifest_member = outer.extractfile(f"{bundle_root}/manifest.txt")
                self.assertIsNotNone(manifest_member)
                manifest = manifest_member.read().decode("utf-8")

            for member in outer_members:
                self.assertFalse(Path(member.name).name.startswith("._"), member.name)
                self.assertFalse(
                    any(key.startswith("LIBARCHIVE.xattr.") for key in member.pax_headers),
                    member.name,
                )

            package_path = Path(temporary_directory) / "app-package.tar.gz"
            package_path.write_bytes(package_bytes)
            with tarfile.open(package_path, "r:gz") as package:
                package_members = package.getmembers()
                package_names = {member.name for member in package_members}
            for member in package_members:
                self.assertFalse(Path(member.name).name.startswith("._"), member.name)
                self.assertFalse(
                    any(key.startswith("LIBARCHIVE.xattr.") for key in member.pax_headers),
                    member.name,
                )
            self.assertIn("codex_image/server/web.py", package_names)
            self.assertIn("codex_image/server/auth.py", package_names)
            self.assertIn("codex_image/webui/static/index.html", package_names)
            self.assertNotIn("codex_image/__main__.py", package_names)
            self.assertNotIn("codex_image/auth.py", package_names)
            self.assertNotIn("codex_image/cli.py", package_names)
            self.assertIn(f"package_sha256={hashlib.sha256(package_bytes).hexdigest()}", manifest)
            self.assertIn("images_included=false", manifest)

    def test_update_builder_rejects_dirty_git_worktree(self) -> None:
        source = UPDATE_BUILD_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("status --porcelain", source)
        self.assertIn("Git worktree is not clean", source)
        self.assertNotIn("docker ", source)

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

    def test_deployer_has_code_only_update_path_with_application_rollback(self) -> None:
        source = DEPLOY_SCRIPT.read_text(encoding="utf-8")
        update_function = source[
            source.index("run_update() {") : source.index("\n}\n\nmain()", source.index("run_update() {")) + 2
        ]

        self.assertIn("sudo ./deploy.sh update [--root DIR]", source)
        self.assertIn('update) run_update ;;', source)
        self.assertIn("--no-deps --force-recreate --no-build --pull never web worker", source)
        self.assertIn("Restoring the previous application release", update_function)
        self.assertIn("validate_runtime_dependencies", update_function)
        self.assertNotIn("load_application_image", update_function)
        self.assertNotIn("load_base_images", update_function)
        self.assertNotIn("prepare_host_directories", update_function)
        self.assertNotIn("bootstrap_admin", update_function)

    def test_application_update_compose_command_targets_only_web_and_worker(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            release_directory = Path(temporary_directory) / "releases" / "v2.0.0"
            config_directory = Path(temporary_directory) / "config"
            release_directory.mkdir(parents=True)
            config_directory.mkdir()
            (config_directory / ".env").write_text("JD_IMAGE_TEST=1\n", encoding="utf-8")
            (release_directory / "release.env").write_text("JD_IMAGE_TEST=1\n", encoding="utf-8")
            (release_directory / "compose.production.yml").write_text("services: {}\n", encoding="utf-8")
            (release_directory / "compose.update.yml").write_text("services: {}\n", encoding="utf-8")
            command_log = Path(temporary_directory) / "commands.log"

            result = subprocess.run(
                [
                    "bash",
                    "-c",
                    """
                    set -Eeuo pipefail
                    source "$1"
                    deploy_root="$2"
                    command_log="$3"
                    docker() {
                      printf '%s\\n' "$*" >>"${command_log}"
                    }
                    start_application_release "$4"
                    """,
                    "test",
                    str(DEPLOY_SCRIPT),
                    temporary_directory,
                    str(command_log),
                    str(release_directory),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            command = command_log.read_text(encoding="utf-8")
            self.assertIn(
                "compose --project-name jd-image-web-ui "
                f"--env-file {config_directory / '.env'} "
                f"--env-file {release_directory / 'release.env'} "
                f"--file {release_directory / 'compose.production.yml'} "
                f"--file {release_directory / 'compose.update.yml'} "
                "up --detach --no-deps --force-recreate --no-build --pull never web worker",
                command,
            )
            self.assertNotIn(" up postgres", command)
            self.assertNotIn(" up proxy", command)


if __name__ == "__main__":
    unittest.main()
