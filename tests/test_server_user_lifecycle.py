from __future__ import annotations

from contextlib import ExitStack
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from httpx import Response
import psycopg

from tests.server_test_database import temporary_postgres_database
from tests.server_test_database import TEST_MASTER_KEY
from tests.test_server_auth import bootstrap_admin


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
ADMIN_PASSWORD = "admin-permanent-password"
USER_PASSWORD = "user-permanent-password"
RESET_USER_PASSWORD = "user-password-after-reset"


def login(client: TestClient, username: str, password: str, *, user_agent: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
        headers={"User-Agent": user_agent},
    )
    if response.status_code != 200:
        raise AssertionError(f"login failed with HTTP {response.status_code}")
    return response.json()


def change_password(
    client: TestClient,
    *,
    current_password: str,
    new_password: str,
    csrf_token: str,
) -> dict:
    response = client.post(
        "/api/auth/password",
        json={
            "current_password": current_password,
            "new_password": new_password,
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    if response.status_code != 200:
        raise AssertionError(f"password change failed with HTTP {response.status_code}")
    return response.json()


def wait_until_ready(client: TestClient, *, timeout_seconds: float = 5.0) -> Response:
    deadline = time.monotonic() + timeout_seconds
    response = client.get("/health/ready")
    while response.status_code != 200 and time.monotonic() < deadline:
        time.sleep(0.05)
        response = client.get("/health/ready")
    return response


def audit_details(value: str) -> dict[str, object]:
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise AssertionError("audit details must be a JSON object")
    return parsed


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerUserLifecycleTests(unittest.TestCase):
    def test_admin_manages_users_and_user_controls_independent_browser_sessions(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                worker_environment, admin_temporary_password = bootstrap_admin(
                    database_url,
                    data_root,
                )
                settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                    worker_heartbeat_interval_seconds=0.1,
                    worker_heartbeat_ttl_seconds=0.4,
                    session_cookie_secure=False,
                )
                worker = subprocess.Popen(
                    [sys.executable, "-m", "codex_image.server.worker"],
                    env=worker_environment,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                try:
                    with ExitStack() as stack:
                        admin = stack.enter_context(TestClient(create_server_app(settings)))
                        user_browser = stack.enter_context(TestClient(create_server_app(settings)))
                        other_browser = stack.enter_context(TestClient(create_server_app(settings)))

                        ready = wait_until_ready(admin)
                        self.assertEqual(ready.status_code, 200)
                        self.assertEqual(ready.json()["components"]["worker"]["status"], "ready")

                        admin_login = login(
                            admin,
                            "admin",
                            admin_temporary_password,
                            user_agent="Admin Browser",
                        )
                        admin_changed = change_password(
                            admin,
                            current_password=admin_temporary_password,
                            new_password=ADMIN_PASSWORD,
                            csrf_token=admin_login["csrf_token"],
                        )
                        admin_csrf = admin_changed["csrf_token"]

                        created = admin.post(
                            "/api/admin/users",
                            json={"username": "designer"},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(created.status_code, 201)
                        created_payload = created.json()
                        user_id = created_payload["user"]["user_id"]
                        user_temporary_password = created_payload["temporary_password"]
                        self.assertTrue(created_payload["user"]["must_change_password"])

                        users = admin.get("/api/admin/users")
                        self.assertEqual(users.status_code, 200)
                        self.assertEqual(
                            [user["username"] for user in users.json()["users"]],
                            ["admin", "designer"],
                        )
                        self.assertNotIn("password_hash", users.text)

                        user_login = login(
                            user_browser,
                            "designer",
                            user_temporary_password,
                            user_agent="Browser One",
                        )
                        self.assertTrue(user_login["user"]["must_change_password"])
                        user_changed = change_password(
                            user_browser,
                            current_password=user_temporary_password,
                            new_password=USER_PASSWORD,
                            csrf_token=user_login["csrf_token"],
                        )
                        user_csrf = user_changed["csrf_token"]
                        user_home = user_browser.get("/")
                        forbidden_admin_home = user_browser.get("/admin")
                        self.assertEqual(user_home.status_code, 200)
                        self.assertIn('class="layout-container"', user_home.text)
                        self.assertEqual(forbidden_admin_home.status_code, 403)

                        login(
                            other_browser,
                            "designer",
                            USER_PASSWORD,
                            user_agent="Browser Two",
                        )
                        sessions = user_browser.get("/api/auth/sessions")
                        self.assertEqual(sessions.status_code, 200)
                        session_items = sessions.json()["sessions"]
                        self.assertEqual(len(session_items), 2)
                        self.assertEqual(sum(item["current"] for item in session_items), 1)
                        self.assertEqual(
                            {item["user_agent"] for item in session_items},
                            {"Browser One", "Browser Two"},
                        )

                        other_session_id = next(
                            item["session_id"] for item in session_items if not item["current"]
                        )
                        revoked_other = user_browser.delete(
                            f"/api/auth/sessions/{other_session_id}",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(revoked_other.status_code, 200)
                        self.assertEqual(other_browser.get("/api/auth/me").status_code, 401)

                        login(
                            other_browser,
                            "designer",
                            USER_PASSWORD,
                            user_agent="Browser Two",
                        )
                        revoked_others = user_browser.post(
                            "/api/auth/sessions/logout-others",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(revoked_others.status_code, 200)
                        self.assertEqual(other_browser.get("/api/auth/me").status_code, 401)
                        self.assertEqual(user_browser.get("/api/auth/me").status_code, 200)

                        login(
                            other_browser,
                            "designer",
                            USER_PASSWORD,
                            user_agent="Browser Two",
                        )
                        logged_out_all = user_browser.post(
                            "/api/auth/sessions/logout-all",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(logged_out_all.status_code, 200)
                        self.assertEqual(user_browser.get("/api/auth/me").status_code, 401)
                        self.assertEqual(other_browser.get("/api/auth/me").status_code, 401)

                        login(
                            user_browser,
                            "designer",
                            USER_PASSWORD,
                            user_agent="Browser One",
                        )
                        login(
                            other_browser,
                            "designer",
                            USER_PASSWORD,
                            user_agent="Browser Two",
                        )
                        reset = admin.post(
                            f"/api/admin/users/{user_id}/reset-password",
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(reset.status_code, 200)
                        reset_temporary_password = reset.json()["temporary_password"]
                        self.assertEqual(user_browser.get("/api/auth/me").status_code, 401)
                        self.assertEqual(other_browser.get("/api/auth/me").status_code, 401)
                        old_password_login = user_browser.post(
                            "/api/auth/login",
                            json={"username": "designer", "password": USER_PASSWORD},
                        )
                        self.assertEqual(old_password_login.status_code, 401)

                        reset_login = login(
                            user_browser,
                            "designer",
                            reset_temporary_password,
                            user_agent="Browser One",
                        )
                        self.assertTrue(reset_login["user"]["must_change_password"])
                        reset_changed = change_password(
                            user_browser,
                            current_password=reset_temporary_password,
                            new_password=RESET_USER_PASSWORD,
                            csrf_token=reset_login["csrf_token"],
                        )

                        deactivated = admin.patch(
                            f"/api/admin/users/{user_id}/status",
                            json={"is_active": False},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(deactivated.status_code, 200)
                        self.assertFalse(deactivated.json()["user"]["is_active"])
                        self.assertEqual(user_browser.get("/api/auth/me").status_code, 401)
                        inactive_login = user_browser.post(
                            "/api/auth/login",
                            json={"username": "designer", "password": RESET_USER_PASSWORD},
                        )
                        self.assertEqual(inactive_login.status_code, 401)

                        reactivated = admin.patch(
                            f"/api/admin/users/{user_id}/status",
                            json={"is_active": True},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(reactivated.status_code, 200)
                        self.assertTrue(reactivated.json()["user"]["is_active"])
                        restored_old_session = user_browser.get("/api/auth/me")
                        self.assertEqual(restored_old_session.status_code, 401)
                        restored_login = login(
                            user_browser,
                            "designer",
                            RESET_USER_PASSWORD,
                            user_agent="Browser One",
                        )
                        self.assertFalse(restored_login["user"]["must_change_password"])

                        forbidden_admin_list = user_browser.get("/api/admin/users")
                        self.assertEqual(forbidden_admin_list.status_code, 403)
                        delete_user = admin.delete(
                            f"/api/admin/users/{user_id}",
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        impersonate = admin.post(
                            f"/api/admin/users/{user_id}/impersonate",
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertIn(delete_user.status_code, {404, 405})
                        self.assertEqual(impersonate.status_code, 404)
                        protected_workbench = admin.get("/admin")
                        self.assertIn('id="user-management"', protected_workbench.text)

                    with psycopg.connect(database_url) as connection:
                        audit_rows = connection.execute(
                            """
                            SELECT action, actor_user_id, subject_user_id, details::text
                            FROM server_audit_events
                            ORDER BY occurred_at, event_id
                            """
                        ).fetchall()

                finally:
                    worker.terminate()
                    worker.wait(timeout=5)

        actions = {row[0] for row in audit_rows}
        self.assertTrue(
            {
                "user.created",
                "user.password_reset",
                "user.deactivated",
                "user.reactivated",
                "session.revoked",
                "session.revoked_others",
                "session.revoked_all",
            }.issubset(actions)
        )
        session_audits = [
            row for row in audit_rows if row[0].startswith("session.revoked")
        ]
        session_audit_details = [audit_details(row[3]) for row in session_audits]
        self.assertTrue(session_audits)
        self.assertTrue(
            all(
                "revoked_count" in details and "session_ids" in details
                for details in session_audit_details
            )
        )
        self.assertTrue(
            {"user_targeted", "password_reset", "account_deactivated"}.issubset(
                {
                    details.get("reason")
                    for details in session_audit_details
                }
            )
        )
        audit_text = "\n".join(row[3] for row in audit_rows)
        secret_leaked = any(
            secret in audit_text
            for secret in {
                admin_temporary_password,
                user_temporary_password,
                reset_temporary_password,
                ADMIN_PASSWORD,
                USER_PASSWORD,
                RESET_USER_PASSWORD,
                reset_changed["csrf_token"],
            }
        )
        self.assertFalse(secret_leaked, "audit details contain a password or session secret")

    def test_repeated_login_failures_temporarily_lock_the_account_and_are_audited(self) -> None:
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
                    login_failure_limit=2,
                    login_lock_seconds=1,
                    session_cookie_secure=False,
                )
                with TestClient(create_server_app(settings)) as client:
                    first_failure = client.post(
                        "/api/auth/login",
                        json={"username": "admin", "password": "incorrect-password"},
                    )
                    lock_trigger = client.post(
                        "/api/auth/login",
                        json={"username": "admin", "password": "incorrect-password"},
                    )
                    correct_while_locked = client.post(
                        "/api/auth/login",
                        json={"username": "admin", "password": temporary_password},
                    )
                    time.sleep(1.1)
                    correct_after_lock = client.post(
                        "/api/auth/login",
                        json={"username": "admin", "password": temporary_password},
                    )

                with psycopg.connect(database_url) as connection:
                    failures = connection.execute(
                        """
                        SELECT details ->> 'reason'
                        FROM server_audit_events
                        WHERE action = 'login.failed'
                        ORDER BY occurred_at, event_id
                        """
                    ).fetchall()

        self.assertEqual(first_failure.status_code, 401)
        self.assertEqual(lock_trigger.status_code, 401)
        self.assertEqual(correct_while_locked.status_code, 401)
        self.assertEqual(correct_after_lock.status_code, 200)
        self.assertEqual([row[0] for row in failures], ["invalid_credentials", "locked", "locked"])


if __name__ == "__main__":
    unittest.main()
