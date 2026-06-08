from __future__ import annotations

import base64
import json
import tempfile
import time
import unittest
from pathlib import Path


def _fake_jwt(payload: dict[str, object]) -> str:
    def encode(data: dict[str, object]) -> str:
        raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return f"{encode({'alg': 'none', 'typ': 'JWT'})}.{encode(payload)}.sig"


def _write_cockpit_account(
    root: Path,
    account_file_id: str,
    *,
    access_token: str,
    account_id: str,
    email: str = "user@example.com",
    auth_mode: str = "oauth",
    requires_reauth: bool = False,
    refresh_token: str | None = None,
) -> None:
    account_dir = root / "codex_accounts"
    account_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "id": account_file_id,
        "email": email,
        "auth_mode": auth_mode,
        "requires_reauth": requires_reauth,
        "account_id": account_id,
        "tokens": {
            "access_token": access_token,
            "refresh_token": f"refresh-{account_file_id}" if refresh_token is None else refresh_token,
            "id_token": f"header.{account_file_id}.sig",
        },
    }
    (account_dir / f"{account_file_id}.json").write_text(json.dumps(payload), encoding="utf-8")


def _write_cockpit_index(root: Path, account_ids: list[str], *, current_account_id: str | None = None) -> None:
    root.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": "1.0",
        "accounts": [{"id": account_id, "email": f"{account_id}@example.com"} for account_id in account_ids],
        "current_account_id": current_account_id,
    }
    (root / "codex_accounts.json").write_text(json.dumps(payload), encoding="utf-8")


class CockpitAuthProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)

    def test_round_robin_starts_with_current_cockpit_account(self) -> None:
        _write_cockpit_index(self.root, ["codex-a", "codex-b"], current_account_id="codex-b")
        _write_cockpit_account(self.root, "codex-a", access_token="access-a", account_id="acct-a")
        _write_cockpit_account(self.root, "codex-b", access_token="access-b", account_id="acct-b")

        from codex_image.cockpit_auth import CockpitAuthProvider

        provider = CockpitAuthProvider(root=self.root)

        self.assertTrue(provider.has_auth())
        self.assertEqual(provider.available_count(), 2)
        self.assertEqual(provider.next_auth_state().access_token, "access-b")
        self.assertEqual(provider.next_auth_state().access_token, "access-a")
        self.assertEqual(provider.next_auth_state().access_token, "access-b")

    def test_lists_usable_auth_states_with_account_file_ids(self) -> None:
        _write_cockpit_index(self.root, ["codex-a", "codex-b"], current_account_id="codex-b")
        _write_cockpit_account(self.root, "codex-a", access_token="access-a", account_id="acct-a")
        _write_cockpit_account(self.root, "codex-b", access_token="access-b", account_id="acct-b")

        from codex_image.cockpit_auth import CockpitAuthProvider

        states = CockpitAuthProvider(root=self.root).list_auth_states()

        self.assertEqual([state.raw["_cockpit_account_file_id"] for state in states], ["codex-b", "codex-a"])
        self.assertEqual([state.account_id for state in states], ["acct-b", "acct-a"])

    def test_reads_specific_cockpit_account_auth_state(self) -> None:
        _write_cockpit_index(self.root, ["codex-a", "codex-b"], current_account_id="codex-a")
        _write_cockpit_account(self.root, "codex-a", access_token="access-a", account_id="acct-a")
        _write_cockpit_account(self.root, "codex-b", access_token="access-b", account_id="acct-b")

        from codex_image.cockpit_auth import CockpitAuthProvider

        state = CockpitAuthProvider(root=self.root).auth_state_for_account_file_id("codex-b")

        self.assertEqual(state.access_token, "access-b")
        self.assertEqual(state.account_id, "acct-b")

    def test_rejects_unsafe_cockpit_account_file_id(self) -> None:
        from codex_image.cockpit_auth import CockpitAuthProvider

        provider = CockpitAuthProvider(root=self.root)

        for account_file_id in ["../codex-a", "codex\\a", "", ".", "..", "bad\x00id", "bad\nid", " codex-a", "codex-a ", "   "]:
            with self.subTest(account_file_id=account_file_id):
                with self.assertRaisesRegex(ValueError, "Invalid Cockpit account file id"):
                    provider.auth_state_for_account_file_id(account_file_id)

    def test_filters_accounts_that_cannot_be_used_for_oauth(self) -> None:
        _write_cockpit_index(self.root, ["codex-a", "codex-b", "codex-c", "codex-d"])
        _write_cockpit_account(self.root, "codex-a", access_token="access-a", account_id="acct-a", auth_mode="api_key")
        _write_cockpit_account(self.root, "codex-b", access_token="access-b", account_id="acct-b", requires_reauth=True)
        _write_cockpit_account(self.root, "codex-c", access_token="access-c", account_id="acct-c", refresh_token="")
        _write_cockpit_account(self.root, "codex-d", access_token="access-d", account_id="acct-d")

        from codex_image.cockpit_auth import CockpitAuthProvider

        provider = CockpitAuthProvider(root=self.root)

        self.assertEqual(provider.available_count(), 1)
        self.assertEqual(provider.next_auth_state().account_id, "acct-d")

    def test_accepts_oauth_accounts_with_refresh_token_without_codex_scope(self) -> None:
        from codex_image.auth import CLIENT_ID
        from codex_image.cockpit_auth import CockpitAuthProvider

        now = int(time.time())
        model_token = _fake_jwt(
            {
                "client_id": "app_X8zY6vW2pQ9tR3dE7nK1jL5gH",
                "scp": ["openid", "profile", "model.request", "model.read"],
                "exp": now + 3600,
            }
        )
        codex_token = _fake_jwt(
            {
                "client_id": CLIENT_ID,
                "scp": ["openid", "profile", "api.connectors.read", "api.connectors.invoke"],
                "exp": now + 3600,
            }
        )
        _write_cockpit_index(self.root, ["codex-model", "codex-ok"])
        _write_cockpit_account(self.root, "codex-model", access_token=model_token, account_id="acct-model")
        _write_cockpit_account(self.root, "codex-ok", access_token=codex_token, account_id="acct-ok")

        provider = CockpitAuthProvider(root=self.root)

        self.assertEqual(provider.available_count(), 2)
        self.assertEqual([state.account_id for state in provider.list_auth_states()], ["acct-model", "acct-ok"])

    def test_filters_oauth_accounts_without_refresh_token(self) -> None:
        _write_cockpit_index(self.root, ["codex-a", "codex-b"])
        _write_cockpit_account(self.root, "codex-a", access_token="access-a", account_id="acct-a", refresh_token="")
        _write_cockpit_account(self.root, "codex-b", access_token="access-b", account_id="acct-b")

        from codex_image.cockpit_auth import CockpitAuthProvider

        provider = CockpitAuthProvider(root=self.root)

        self.assertEqual(provider.available_count(), 1)
        self.assertEqual(provider.next_auth_state().account_id, "acct-b")

    def test_filters_expired_codex_responses_tokens(self) -> None:
        from codex_image.auth import CLIENT_ID
        from codex_image.cockpit_auth import CockpitAuthProvider

        now = int(time.time())
        expired_token = _fake_jwt(
            {
                "client_id": CLIENT_ID,
                "scp": ["openid", "profile", "api.connectors.invoke"],
                "exp": now - 60,
            }
        )
        fresh_token = _fake_jwt(
            {
                "client_id": CLIENT_ID,
                "scp": ["openid", "profile", "api.connectors.invoke"],
                "exp": now + 3600,
            }
        )
        _write_cockpit_index(self.root, ["codex-expired", "codex-fresh"])
        _write_cockpit_account(self.root, "codex-expired", access_token=expired_token, account_id="acct-expired")
        _write_cockpit_account(self.root, "codex-fresh", access_token=fresh_token, account_id="acct-fresh")

        provider = CockpitAuthProvider(root=self.root)

        self.assertEqual(provider.available_count(), 1)
        self.assertEqual(provider.next_auth_state().account_id, "acct-fresh")

    def test_unauthorized_reuses_current_account_when_cockpit_rotated_token(self) -> None:
        _write_cockpit_index(self.root, ["codex-a", "codex-b"], current_account_id="codex-a")
        _write_cockpit_account(self.root, "codex-a", access_token="expired-a", account_id="acct-a")
        _write_cockpit_account(self.root, "codex-b", access_token="access-b", account_id="acct-b")

        from codex_image.cockpit_auth import CockpitAuthProvider

        provider = CockpitAuthProvider(root=self.root)
        stale = provider.next_auth_state()
        _write_cockpit_account(self.root, "codex-a", access_token="fresh-a", account_id="acct-a")

        refreshed = provider.next_auth_state_after_unauthorized(stale)

        self.assertIsNotNone(refreshed)
        self.assertEqual(refreshed.account_id, "acct-a")
        self.assertEqual(refreshed.access_token, "fresh-a")

    def test_unauthorized_switches_to_next_account_when_token_did_not_change(self) -> None:
        _write_cockpit_index(self.root, ["codex-a", "codex-b"], current_account_id="codex-a")
        _write_cockpit_account(self.root, "codex-a", access_token="expired-a", account_id="acct-a")
        _write_cockpit_account(self.root, "codex-b", access_token="access-b", account_id="acct-b")

        from codex_image.cockpit_auth import CockpitAuthProvider

        provider = CockpitAuthProvider(root=self.root)
        stale = provider.next_auth_state()

        replacement = provider.next_auth_state_after_unauthorized(stale)

        self.assertIsNotNone(replacement)
        self.assertEqual(replacement.account_id, "acct-b")
        self.assertEqual(replacement.access_token, "access-b")


if __name__ == "__main__":
    unittest.main()
