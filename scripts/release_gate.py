from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the server-only release gate")
    parser.add_argument("--static-only", action="store_true")
    parser.add_argument(
        "--database-url",
        default=os.environ.get("JD_IMAGE_DATABASE_URL", ""),
        help="production PostgreSQL URL used to verify department model readiness",
    )
    args = parser.parse_args(argv)
    failures: list[str] = []
    for forbidden in (
        "launcher",
        "packaging",
        "Start WebUI.command",
        "Start WebUI.bat",
        "Start WebUI Debug.command",
    ):
        if (ROOT / forbidden).exists():
            failures.append(f"forbidden local product path exists: {forbidden}")
    if (ROOT / ".github/workflows/release-portable.yml").exists():
        failures.append("portable release workflow still exists")
    for forbidden_file in (
        "codex_image/auth.py",
        "codex_image/codex_images_client.py",
        "codex_image/codex_responses_client.py",
        "codex_image/prompt_guard.py",
    ):
        # prompt_guard is server-safe and intentionally retained.
        if forbidden_file.endswith("prompt_guard.py"):
            continue
        if (ROOT / forbidden_file).exists():
            failures.append(f"legacy local client file exists: {forbidden_file}")
    required = (
        "compose.server.yml",
        "compose.server.external-postgres.yml",
        "Dockerfile.server",
        "codex_image/server/app.py",
        "codex_image/server/worker.py",
        "codex_image/server/ops.py",
        "codex_image/webui/static/index.html",
        "codex_image/webui/static/app.js",
        "deploy/server/README.md",
    )
    failures.extend(f"required release file is missing: {path}" for path in required if not (ROOT / path).is_file())
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    if "服务器部署" not in readme or "浏览器" not in readme:
        failures.append("README does not describe the server-only browser product")
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    if "Local-first" in pyproject or "WebUI and CLI" in pyproject:
        failures.append("pyproject still describes the removed local product")
    if args.database_url:
        try:
            import psycopg

            with psycopg.connect(args.database_url, connect_timeout=5) as connection:
                rows = connection.execute(
                    """
                    SELECT versions.display_name, models.display_name, models.validation_status
                    FROM generation_models AS models
                    JOIN provider_catalog_versions AS versions
                      ON versions.provider_version_id = models.provider_version_id
                     AND versions.is_active = TRUE
                    JOIN department_provider_credentials AS credentials
                      ON credentials.provider_version_id = versions.provider_version_id
                     AND credentials.is_active = TRUE
                     AND credentials.encrypted_api_key IS NOT NULL
                    WHERE models.owner_user_id IS NULL
                      AND models.is_default = TRUE
                      AND models.is_enabled = TRUE
                      AND models.validation_status <> 'verified'
                    ORDER BY versions.display_name, models.display_name
                    """
                ).fetchall()
            failures.extend(
                f"department default model is not verified: {provider_name} / {model_name} ({status})"
                for provider_name, model_name, status in rows
            )
        except Exception as error:
            failures.append(f"department model readiness check failed: {type(error).__name__}")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print("static release gate passed")
    if args.static_only:
        return 0
    import subprocess

    return subprocess.call([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"], cwd=ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
