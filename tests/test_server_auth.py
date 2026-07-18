from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
import psycopg

from tests.server_test_database import temporary_postgres_database
from tests.server_test_database import TEST_MASTER_KEY


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
TEMPORARY_PASSWORD_LINE = re.compile(r"^Temporary password: \S+$", re.MULTILINE)


def sanitized_process_output(output: str) -> str:
    return TEMPORARY_PASSWORD_LINE.sub("Temporary password: [REDACTED]", output)


def bootstrap_admin(database_url: str, data_root: Path) -> tuple[dict[str, str], str]:
    environment = os.environ.copy()
    environment.update(
        {
            "JD_IMAGE_DATABASE_URL": database_url,
            "JD_IMAGE_DATA_ROOT": str(data_root),
            "JD_IMAGE_MASTER_KEY": TEST_MASTER_KEY,
            "JD_IMAGE_WORKER_HEARTBEAT_INTERVAL_SECONDS": "0.1",
            "JD_IMAGE_WORKER_HEARTBEAT_TTL_SECONDS": "0.4",
        }
    )
    created = subprocess.run(
        [
            sys.executable,
            "-m",
            "codex_image.server.ops",
            "bootstrap-admin",
            "--username",
            "admin",
        ],
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    password_match = re.search(r"^Temporary password: (\S+)$", created.stdout, re.MULTILINE)
    if created.returncode != 0 or password_match is None:
        raise AssertionError(
            "bootstrap failed: "
            f"{sanitized_process_output(created.stdout)}\n"
            f"{sanitized_process_output(created.stderr)}"
        )
    return environment, password_match.group(1)


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerAdminBootstrapTests(unittest.TestCase):
    def test_operations_cli_bootstraps_exactly_one_admin_and_prints_password_once(self) -> None:
        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                environment = os.environ.copy()
                environment.update(
                    {
                        "JD_IMAGE_DATABASE_URL": database_url,
                        "JD_IMAGE_DATA_ROOT": str(Path(tmp) / "data"),
                        "JD_IMAGE_MASTER_KEY": TEST_MASTER_KEY,
                    }
                )
                command = [
                    sys.executable,
                    "-m",
                    "codex_image.server.ops",
                    "bootstrap-admin",
                    "--username",
                    "admin",
                ]
                created = subprocess.run(
                    command,
                    env=environment,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                repeated = subprocess.run(
                    command,
                    env=environment,
                    capture_output=True,
                    text=True,
                    check=False,
                )

        password_match = re.search(r"^Temporary password: (\S+)$", created.stdout, re.MULTILINE)
        self.assertEqual(created.returncode, 0, sanitized_process_output(created.stderr))
        self.assertIn(
            "Initial administrator created",
            sanitized_process_output(created.stdout),
        )
        self.assertIsNotNone(password_match)
        self.assertGreaterEqual(len(password_match.group(1)), 20)
        self.assertEqual(repeated.returncode, 1)
        self.assertIn("already initialized", repeated.stderr)
        repeated_exposed_password = bool(
            TEMPORARY_PASSWORD_LINE.search(repeated.stdout + repeated.stderr)
        )
        self.assertFalse(
            repeated_exposed_password,
            "repeated bootstrap exposed a temporary password",
        )


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerAuthenticationFlowTests(unittest.TestCase):
    def test_browser_login_requires_one_time_password_change_then_logout_revokes_session(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                environment, temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                    database_connect_timeout_seconds=2,
                    worker_heartbeat_interval_seconds=0.1,
                    worker_heartbeat_ttl_seconds=0.4,
                    session_ttl_seconds=3600,
                    session_cookie_secure=False,
                )
                worker = subprocess.Popen(
                    [sys.executable, "-m", "codex_image.server.worker"],
                    env=environment,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                try:
                    with TestClient(create_server_app(settings)) as client:
                        login_page = client.get("/login")
                        anonymous_api = client.get("/api/auth/me")
                        anonymous_file = client.get("/files/private/example.png")
                        cross_site = client.post(
                            "/api/auth/login",
                            json={"username": "admin", "password": temporary_password},
                            headers={"Origin": "http://attacker.example"},
                        )
                        bad_login = client.post(
                            "/api/auth/login",
                            json={"username": "admin", "password": "not-the-password"},
                        )
                        login = client.post(
                            "/api/auth/login",
                            json={"username": "admin", "password": temporary_password},
                        )
                        csrf_token = login.json()["csrf_token"]
                        forced_login_page = client.get("/login", follow_redirects=False)

                        with TestClient(create_server_app(settings)) as second_client:
                            reused_temporary_password = second_client.post(
                                "/api/auth/login",
                                json={"username": "admin", "password": temporary_password},
                            )

                        forced_page = client.get("/", follow_redirects=False)
                        missing_csrf = client.post(
                            "/api/auth/password",
                            json={
                                "current_password": temporary_password,
                                "new_password": "a-new-secure-password",
                            },
                        )
                        short_password = client.post(
                            "/api/auth/password",
                            json={
                                "current_password": temporary_password,
                                "new_password": "too-short",
                            },
                            headers={"X-CSRF-Token": csrf_token},
                        )
                        changed = client.post(
                            "/api/auth/password",
                            json={
                                "current_password": temporary_password,
                                "new_password": "a-new-secure-password",
                            },
                            headers={"X-CSRF-Token": csrf_token},
                        )
                        changed_session_token = client.cookies.get("jd_image_session")
                        home = client.get("/")
                        completed_login_page = client.get("/login", follow_redirects=False)
                        current_user = client.get("/api/auth/me")
                        authenticated_missing_file = client.get("/files/private/example.png")
                        logout_without_csrf = client.post("/api/auth/logout")
                        logout = client.post(
                            "/api/auth/logout",
                            headers={"X-CSRF-Token": changed.json()["csrf_token"]},
                        )
                        after_logout = client.get("/api/auth/me")
                        with TestClient(create_server_app(settings)) as replay_client:
                            replay_client.cookies.set(
                                "jd_image_session",
                                changed_session_token,
                            )
                            replayed_logged_out_session = replay_client.get("/api/auth/me")

                    with psycopg.connect(database_url) as connection:
                        user_state = connection.execute(
                            """
                            SELECT
                                COUNT(*),
                                BOOL_AND(must_change_password = FALSE),
                                BOOL_AND(temporary_login_consumed_at IS NULL)
                            FROM server_users
                            """
                        ).fetchone()
                        session_state = connection.execute(
                            """
                            SELECT
                                COUNT(*),
                                COUNT(*) FILTER (WHERE revoked_at IS NULL)
                            FROM server_sessions
                            """
                        ).fetchone()
                finally:
                    worker.terminate()
                    worker.wait(timeout=5)

        self.assertEqual(login_page.status_code, 200)
        self.assertIn('id="login-form"', login_page.text)
        self.assertIn("default-src 'self'", login_page.headers["content-security-policy"])
        self.assertEqual(anonymous_api.status_code, 401)
        self.assertEqual(anonymous_file.status_code, 401)
        self.assertEqual(cross_site.status_code, 403)
        self.assertEqual(bad_login.status_code, 401)
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.headers["cache-control"], "no-store")
        self.assertTrue(login.json()["user"]["must_change_password"])
        self.assertNotIn("session", login.json())
        session_cookie = next(
            header for header in login.headers.get_list("set-cookie") if header.startswith("jd_image_session=")
        )
        self.assertIn("HttpOnly", session_cookie)
        self.assertIn("SameSite=strict", session_cookie)
        self.assertEqual(reused_temporary_password.status_code, 401)
        self.assertEqual(forced_login_page.status_code, 303)
        self.assertEqual(forced_login_page.headers["location"], "/login?change=1")
        self.assertEqual(forced_page.status_code, 303)
        self.assertEqual(forced_page.headers["location"], "/login?change=1")
        self.assertEqual(missing_csrf.status_code, 403)
        self.assertEqual(short_password.status_code, 400)
        self.assertEqual(changed.status_code, 200)
        self.assertFalse(changed.json()["user"]["must_change_password"])
        self.assertEqual(home.status_code, 200)
        self.assertIn('id="server-home"', home.text)
        self.assertEqual(completed_login_page.status_code, 303)
        self.assertEqual(completed_login_page.headers["location"], "/")
        self.assertEqual(current_user.status_code, 200)
        self.assertEqual(current_user.json()["user"]["username"], "admin")
        self.assertEqual(authenticated_missing_file.status_code, 404)
        self.assertEqual(logout_without_csrf.status_code, 403)
        self.assertEqual(logout.status_code, 200)
        self.assertEqual(after_logout.status_code, 401)
        self.assertEqual(replayed_logged_out_session.status_code, 401)
        self.assertEqual(user_state, (1, True, True))
        self.assertEqual(session_state, (2, 0))

    def test_temporary_password_cannot_be_kept_as_the_permanent_password(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                    session_cookie_secure=False,
                )
                with TestClient(create_server_app(settings)) as client:
                    login = client.post(
                        "/api/auth/login",
                        json={"username": "admin", "password": temporary_password},
                    )
                    unchanged = client.post(
                        "/api/auth/password",
                        json={
                            "current_password": temporary_password,
                            "new_password": temporary_password,
                        },
                        headers={"X-CSRF-Token": login.json()["csrf_token"]},
                    )
                    current_user = client.get("/api/auth/me")

        self.assertEqual(unchanged.status_code, 400)
        self.assertTrue(current_user.json()["user"]["must_change_password"])

    def test_session_expires(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                    session_ttl_seconds=1,
                    session_cookie_secure=False,
                )
                with TestClient(create_server_app(settings)) as client:
                    login = client.post(
                        "/api/auth/login",
                        json={"username": "admin", "password": temporary_password},
                    )
                    time.sleep(1.1)
                    expired = client.get("/api/auth/me")

        self.assertEqual(login.status_code, 200)
        self.assertEqual(expired.status_code, 401)


if __name__ == "__main__":
    unittest.main()
