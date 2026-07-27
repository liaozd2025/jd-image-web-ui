from __future__ import annotations

import hashlib
import io
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
DEPLOY_SCRIPT = ROOT / "deploy" / "server" / "deploy.sh"
UPDATE_COMPOSE = ROOT / "deploy" / "server" / "compose.update.yml"
REQUIREMENTS = ROOT / "requirements-server.txt"


class ProgramUpdateIntegrationTests(unittest.TestCase):
    def _create_update_fixture(self, root: Path) -> tuple[Path, Path, str]:
        bundle = root / "update-bundle"
        bundle.mkdir()
        shutil.copy2(DEPLOY_SCRIPT, bundle / "deploy.sh")
        shutil.copy2(UPDATE_COMPOSE, bundle / "compose.update.yml")
        shutil.copy2(REQUIREMENTS, bundle / "requirements-server.txt")
        (bundle / "README.md").write_text("program update fixture\n", encoding="utf-8")

        package_source = root / "package-source" / "codex_image"
        package_source.mkdir(parents=True)
        (package_source / "__init__.py").write_text("", encoding="utf-8")
        (package_source / "version_marker.txt").write_text("v2.0.0\n", encoding="utf-8")
        package_archive = bundle / "app-package.tar.gz"
        with tarfile.open(package_archive, "w:gz") as archive:
            archive.add(package_source, arcname="codex_image")

        package_sha256 = hashlib.sha256(package_archive.read_bytes()).hexdigest()
        requirements_sha256 = hashlib.sha256(REQUIREMENTS.read_bytes()).hexdigest()
        (bundle / "update.env").write_text(
            "\n".join(
                (
                    "JD_IMAGE_RELEASE_VERSION=v2.0.0",
                    f"JD_IMAGE_GIT_COMMIT={'a' * 40}",
                    f"JD_IMAGE_PACKAGE_SHA256={package_sha256}",
                    f"JD_IMAGE_REQUIREMENTS_SHA256={requirements_sha256}",
                    "",
                )
            ),
            encoding="utf-8",
        )
        (bundle / "manifest.txt").write_text(
            "\n".join(
                (
                    "product=jd-image-web-ui",
                    "release_kind=program-update",
                    "release_version=v2.0.0",
                    f"package_sha256={package_sha256}",
                    f"requirements_sha256={requirements_sha256}",
                    "images_included=false",
                    "",
                )
            ),
            encoding="utf-8",
        )

        deploy_root = root / "production"
        config = deploy_root / "config"
        current_release = deploy_root / "releases" / "v1.0.0"
        config.mkdir(parents=True)
        current_release.mkdir(parents=True)
        (config / ".env").write_text("JD_IMAGE_TEST=1\n", encoding="utf-8")
        (config / ".installed").write_text("", encoding="utf-8")
        (current_release / "release.env").write_text(
            "\n".join(
                (
                    "JD_IMAGE_RELEASE_VERSION=v1.0.0",
                    f"JD_IMAGE_GIT_COMMIT={'b' * 40}",
                    "JD_IMAGE_APP_IMAGE=jd-image-web-ui:v1.0.0",
                    "JD_IMAGE_POSTGRES_IMAGE=jd-image-web-ui/postgres:16.10-alpine-amd64",
                    "JD_IMAGE_NGINX_IMAGE=jd-image-web-ui/nginx:1.27.5-alpine-amd64",
                    "",
                )
            ),
            encoding="utf-8",
        )
        (current_release / "compose.production.yml").write_text("services: {}\n", encoding="utf-8")
        (current_release / "nginx.conf").write_text("server {}\n", encoding="utf-8")
        (deploy_root / "current").symlink_to("releases/v1.0.0")
        return bundle, deploy_root, requirements_sha256

    @staticmethod
    def _replace_package_archive(bundle: Path, *, unsafe_kind: str) -> None:
        package_archive = bundle / "app-package.tar.gz"
        with tarfile.open(package_archive, "w:gz") as archive:
            root = tarfile.TarInfo("codex_image")
            root.type = tarfile.DIRTYPE
            root.mode = 0o755
            archive.addfile(root)
            if unsafe_kind == "parent":
                content = b"escape\n"
                member = tarfile.TarInfo("codex_image/..")
                member.size = len(content)
                member.mode = 0o644
                archive.addfile(member, io.BytesIO(content))
            elif unsafe_kind == "symlink":
                member = tarfile.TarInfo("codex_image/link")
                member.type = tarfile.SYMTYPE
                member.linkname = "../outside"
                archive.addfile(member)
            else:
                raise AssertionError(f"unexpected unsafe archive kind: {unsafe_kind}")

        package_sha256 = hashlib.sha256(package_archive.read_bytes()).hexdigest()
        update_env = bundle / "update.env"
        update_lines = update_env.read_text(encoding="utf-8").splitlines()
        update_env.write_text(
            "\n".join(
                f"JD_IMAGE_PACKAGE_SHA256={package_sha256}"
                if line.startswith("JD_IMAGE_PACKAGE_SHA256=")
                else line
                for line in update_lines
            )
            + "\n",
            encoding="utf-8",
        )

    def test_update_stages_package_and_reuses_all_installed_images(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            bundle, deploy_root, requirements_sha256 = self._create_update_fixture(root)
            command_log = root / "docker.log"
            result = subprocess.run(
                [
                    "bash",
                    "-c",
                    """
                    set -Eeuo pipefail
                    source "$1"
                    deploy_root="$2"
                    command_log="$3"
                    expected_runtime_sha256="$4"
                    docker() {
                      printf '%s\n' "$*" >>"${command_log}"
                      if [[ "$1" == "image" && "$2" == "inspect" && "${3:-}" == "--format" ]]; then
                        printf 'linux/amd64\n'
                      elif [[ "$1" == "run" ]]; then
                        printf '%s\n' "${expected_runtime_sha256}"
                      elif [[ "$1" == "compose" && "$*" == *" exec -T web python -c "* ]]; then
                        printf 'worker-v1\n'
                      fi
                    }
                    run_update
                    """,
                    "test",
                    str(bundle / "deploy.sh"),
                    str(deploy_root),
                    str(command_log),
                    requirements_sha256,
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((deploy_root / "current").readlink(), Path("releases/v2.0.0"))

            update_release = deploy_root / "releases" / "v2.0.0"
            self.assertEqual(
                (update_release / "application" / "codex_image" / "version_marker.txt").read_text(
                    encoding="utf-8"
                ),
                "v2.0.0\n",
            )
            release_environment = (update_release / "release.env").read_text(encoding="utf-8")
            self.assertIn("JD_IMAGE_APP_IMAGE=jd-image-web-ui:v1.0.0", release_environment)
            self.assertIn(
                "JD_IMAGE_POSTGRES_IMAGE=jd-image-web-ui/postgres:16.10-alpine-amd64",
                release_environment,
            )
            self.assertIn(
                "JD_IMAGE_NGINX_IMAGE=jd-image-web-ui/nginx:1.27.5-alpine-amd64",
                release_environment,
            )
            self.assertIn(
                f"JD_IMAGE_APP_PACKAGE_DIR={update_release}/application/codex_image",
                release_environment,
            )

            docker_commands = command_log.read_text(encoding="utf-8")
            self.assertNotIn(" load ", f" {docker_commands} ")
            self.assertNotIn(" pull ", f" {docker_commands} ")
            self.assertIn(
                "up --detach --no-deps --force-recreate --no-build --pull never web worker",
                docker_commands,
            )
            self.assertNotIn("up postgres", docker_commands)
            self.assertNotIn("up proxy", docker_commands)

    def test_failed_update_restores_previous_application_release(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            bundle, deploy_root, _ = self._create_update_fixture(root)
            start_log = root / "starts.log"
            result = subprocess.run(
                [
                    "bash",
                    "-c",
                    """
                    set -Eeuo pipefail
                    source "$1"
                    deploy_root="$2"
                    start_log="$3"
                    validate_runtime_dependencies() {
                      :
                    }
                    read_worker_instance_id() {
                      printf 'worker-v1\n'
                    }
                    start_application_release() {
                      printf '%s\n' "$1" >>"${start_log}"
                      [[ "$1" != */v2.0.0 ]]
                    }
                    release_is_ready() {
                      return 0
                    }
                    compose_release() {
                      return 0
                    }
                    run_update
                    """,
                    "test",
                    str(bundle / "deploy.sh"),
                    str(deploy_root),
                    str(start_log),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("the previous Web and Worker release was restored", result.stderr)
            self.assertIn("Restoring the previous application release v1.0.0", result.stdout)
            self.assertEqual((deploy_root / "current").readlink(), Path("releases/v1.0.0"))
            self.assertEqual(
                start_log.read_text(encoding="utf-8").splitlines(),
                [
                    str(deploy_root / "releases" / "v2.0.0"),
                    str(deploy_root / "releases" / "v1.0.0"),
                ],
            )

    def test_readiness_failure_requires_new_worker_and_restores_previous_release(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            bundle, deploy_root, _ = self._create_update_fixture(root)
            event_log = root / "events.log"
            result = subprocess.run(
                [
                    "bash",
                    "-c",
                    """
                    set -Eeuo pipefail
                    source "$1"
                    deploy_root="$2"
                    event_log="$3"
                    validate_runtime_dependencies() {
                      :
                    }
                    read_worker_instance_id() {
                      printf 'worker-v1\n'
                    }
                    start_application_release() {
                      printf 'start %s\n' "$1" >>"${event_log}"
                    }
                    release_is_ready() {
                      printf 'ready %s %s\n' "$1" "${2:-}" >>"${event_log}"
                      if [[ "$1" == */v2.0.0 ]]; then
                        [[ "${2:-}" == "worker-v1" ]] || return 2
                        return 1
                      fi
                      return 0
                    }
                    run_update
                    """,
                    "test",
                    str(bundle / "deploy.sh"),
                    str(deploy_root),
                    str(event_log),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("the previous Web and Worker release was restored", result.stderr)
            self.assertEqual((deploy_root / "current").readlink(), Path("releases/v1.0.0"))
            self.assertEqual(
                event_log.read_text(encoding="utf-8").splitlines(),
                [
                    f"start {deploy_root / 'releases' / 'v2.0.0'}",
                    f"ready {deploy_root / 'releases' / 'v2.0.0'} worker-v1",
                    f"start {deploy_root / 'releases' / 'v1.0.0'}",
                    f"ready {deploy_root / 'releases' / 'v1.0.0'} ",
                ],
            )

    def test_invalid_archives_are_rejected_before_staging_or_docker(self) -> None:
        for unsafe_kind, expected_error in (
            ("parent", "unsafe path"),
            ("symlink", "only regular files and directories"),
        ):
            with self.subTest(unsafe_kind=unsafe_kind):
                with tempfile.TemporaryDirectory() as temporary_directory:
                    root = Path(temporary_directory)
                    bundle, deploy_root, _ = self._create_update_fixture(root)
                    self._replace_package_archive(bundle, unsafe_kind=unsafe_kind)
                    command_log = root / "docker.log"
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
                              printf '%s\n' "$*" >>"${command_log}"
                            }
                            run_update
                            """,
                            "test",
                            str(bundle / "deploy.sh"),
                            str(deploy_root),
                            str(command_log),
                        ],
                        check=False,
                        capture_output=True,
                        text=True,
                    )
                    self.assertEqual(result.returncode, 1)
                    self.assertIn(expected_error, result.stderr)
                    self.assertFalse((deploy_root / "releases" / "v2.0.0").exists())
                    self.assertFalse(command_log.exists())

    def test_dependency_change_is_rejected_before_staging_or_restarting_services(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            bundle, deploy_root, _ = self._create_update_fixture(root)
            command_log = root / "docker.log"
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
                      printf '%s\n' "$*" >>"${command_log}"
                      if [[ "$1" == "image" && "$2" == "inspect" && "${3:-}" == "--format" ]]; then
                        printf 'linux/amd64\n'
                      elif [[ "$1" == "run" ]]; then
                        printf '%064d\n' 0
                      fi
                    }
                    run_update
                    """,
                    "test",
                    str(bundle / "deploy.sh"),
                    str(deploy_root),
                    str(command_log),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("server dependencies changed", result.stderr)
            self.assertEqual((deploy_root / "current").readlink(), Path("releases/v1.0.0"))
            self.assertFalse((deploy_root / "releases" / "v2.0.0").exists())
            docker_commands = command_log.read_text(encoding="utf-8")
            self.assertNotIn("compose", docker_commands)


if __name__ == "__main__":
    unittest.main()
