from __future__ import annotations

import base64
import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from tests.helpers import FakeResponse, FakeTransport


def _jwt(payload: dict[str, object]) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode("utf-8")).decode("ascii").rstrip("=")
    body = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii").rstrip("=")
    return f"{header}.{body}.sig"


class AccountQuotaTests(unittest.TestCase):
    def test_fetch_account_quota_reads_image_gen_limit(self) -> None:
        from codex_image.account_quota import fetch_account_quota
        from codex_image.auth import AuthState

        token = _jwt({"https://api.openai.com/auth": {"chatgpt_plan_type": "plus"}, "email": "user@example.com"})
        state = AuthState(
            path=Path("auth.json"),
            access_token=token,
            refresh_token="refresh-secret",
            id_token="",
            account_id="acct-123",
            last_refresh=None,
            raw={},
        )
        transport = FakeTransport(
            [
                FakeResponse(200, b'{"user":{"id":"user-1","email":"fallback@example.com"}}'),
                FakeResponse(
                    200,
                    json.dumps(
                        {
                            "limits_progress": [
                                {"feature_name": "other", "remaining": 1},
                                {"feature_name": "image_gen", "remaining": 7, "reset_after": "PT3H"},
                            ]
                        }
                    ).encode("utf-8"),
                ),
            ]
        )

        quota = fetch_account_quota(state, transport=transport)

        self.assertEqual(quota["remaining"], 7)
        self.assertEqual(quota["reset_after"], "PT3H")
        self.assertEqual(quota["status"], "ok")
        self.assertEqual(quota["plan"], "plus")
        self.assertEqual(quota["email"], "user@example.com")
        self.assertEqual([request["method"] for request in transport.requests], ["GET", "GET"])
        self.assertEqual(transport.requests[0]["url"], "https://chatgpt.com/backend-api/me")
        self.assertEqual(transport.requests[1]["url"], "https://chatgpt.com/backend-api/wham/usage")
        self.assertEqual(transport.requests[0]["headers"]["ChatGPT-Account-Id"], "acct-123")
        self.assertIn("Bearer ", transport.requests[0]["headers"]["Authorization"])
        self.assertNotIn("refresh-secret", json.dumps(quota))

    def test_fetch_account_quota_accepts_odyssey_limit_alias(self) -> None:
        from codex_image.account_quota import fetch_account_quota
        from codex_image.auth import AuthState

        state = AuthState(
            path=Path("auth.json"),
            access_token="access-token",
            refresh_token="refresh-token",
            id_token="",
            account_id="acct-123",
            last_refresh=None,
            raw={},
        )
        transport = FakeTransport(
            [
                FakeResponse(200, b"{}"),
                FakeResponse(
                    200,
                    json.dumps(
                        {
                            "limits_progress": [
                                {"feature_name": "deep_research", "remaining": 125},
                                {"feature_name": "odyssey", "remaining": 200, "reset_after": "2026-06-11T23:13:08Z"},
                            ]
                        }
                    ).encode("utf-8"),
                ),
            ]
        )

        quota = fetch_account_quota(state, transport=transport)

        self.assertEqual(quota["remaining"], 200)
        self.assertEqual(quota["reset_after"], "2026-06-11T23:13:08Z")
        self.assertEqual(quota["status"], "ok")
        self.assertEqual(quota["raw_limit"]["feature_name"], "odyssey")

    def test_fetch_account_quota_reads_codex_window_percentages(self) -> None:
        from codex_image.account_quota import fetch_account_quota
        from codex_image.auth import AuthState

        state = AuthState(
            path=Path("auth.json"),
            access_token="access-token",
            refresh_token="refresh-token",
            id_token="",
            account_id="acct-123",
            last_refresh=None,
            raw={},
        )
        transport = FakeTransport(
            [
                FakeResponse(200, b"{}"),
                FakeResponse(
                    200,
                    json.dumps(
                        {
                            "limits_progress": [
                                {"feature_name": "image_gen", "remaining": 9},
                                {
                                    "feature_name": "codex_5h",
                                    "used": 35,
                                    "limit": 50,
                                    "reset_after": "PT2H",
                                },
                                {
                                    "feature_name": "codex_weekly",
                                    "used_percent": 42.4,
                                    "reset_after": "P3D",
                                },
                            ]
                        }
                    ).encode("utf-8"),
                ),
            ]
        )

        quota = fetch_account_quota(state, transport=transport)

        self.assertEqual(quota["remaining"], 9)
        self.assertEqual(quota["codex_5h_percent"], 70)
        self.assertEqual(quota["codex_week_percent"], 42)
        self.assertEqual(quota["codex_limits"]["five_hour"]["reset_after"], "PT2H")
        self.assertEqual(quota["codex_limits"]["week"]["reset_after"], "P3D")

    def test_fetch_account_quota_reads_wham_usage_codex_windows(self) -> None:
        from codex_image.account_quota import fetch_account_quota
        from codex_image.auth import AuthState

        state = AuthState(
            path=Path("auth.json"),
            access_token="access-token",
            refresh_token="refresh-token",
            id_token="",
            account_id="acct-123",
            last_refresh=None,
            raw={},
        )
        transport = FakeTransport(
            [
                FakeResponse(200, b'{"user":{"id":"user-1","email":"user@example.com"}}'),
                FakeResponse(
                    200,
                    json.dumps(
                        {
                            "plan_type": "plus",
                            "rate_limit": {
                                "allowed": True,
                                "primary_window": {
                                    "used_percent": 35,
                                    "limit_window_seconds": 18000,
                                    "reset_at": 1800000000,
                                },
                                "secondary_window": {
                                    "used_percent": 42,
                                    "limit_window_seconds": 604800,
                                    "reset_at": 1800600000,
                                },
                            },
                        }
                    ).encode("utf-8"),
                ),
            ]
        )

        quota = fetch_account_quota(state, transport=transport)

        self.assertEqual(quota["status"], "ok")
        self.assertIsNone(quota["remaining"])
        self.assertTrue(quota["quota_known"])
        self.assertEqual(quota["plan"], "plus")
        self.assertEqual(quota["email"], "user@example.com")
        self.assertEqual(quota["codex_5h_percent"], 65)
        self.assertEqual(quota["codex_week_percent"], 58)
        self.assertEqual(quota["codex_limits"]["five_hour"]["window_minutes"], 300)
        self.assertEqual(quota["codex_limits"]["five_hour"]["reset_after"], "2027-01-15T08:00:00+00:00")
        self.assertEqual(quota["codex_limits"]["week"]["window_minutes"], 10080)
        self.assertEqual(quota["codex_limits"]["week"]["reset_after"], "2027-01-22T06:40:00+00:00")
        self.assertEqual(transport.requests[1]["method"], "GET")
        self.assertEqual(transport.requests[1]["url"], "https://chatgpt.com/backend-api/wham/usage")

    def test_fetch_account_quota_marks_wham_usage_limited_with_reset(self) -> None:
        from codex_image.account_quota import fetch_account_quota
        from codex_image.auth import AuthState

        state = AuthState(
            path=Path("auth.json"),
            access_token="access-token",
            refresh_token="refresh-token",
            id_token="",
            account_id="acct-123",
            last_refresh=None,
            raw={},
        )
        transport = FakeTransport(
            [
                FakeResponse(200, b"{}"),
                FakeResponse(
                    200,
                    json.dumps(
                        {
                            "rate_limit": {
                                "allowed": False,
                                "primary_window": {
                                    "used_percent": 100,
                                    "limit_window_seconds": 18000,
                                    "reset_at": 1800000000,
                                },
                                "secondary_window": {
                                    "used_percent": 20,
                                    "limit_window_seconds": 604800,
                                    "reset_at": 1800600000,
                                },
                            },
                        }
                    ).encode("utf-8"),
                ),
            ]
        )

        quota = fetch_account_quota(state, transport=transport)

        self.assertEqual(quota["status"], "limited")
        self.assertTrue(quota["quota_known"])
        self.assertEqual(quota["codex_5h_percent"], 0)
        self.assertEqual(quota["codex_week_percent"], 80)
        self.assertEqual(quota["reset_after"], "2027-01-15T08:00:00+00:00")

    def test_fetch_account_quota_derives_chatgpt_account_id_from_access_token(self) -> None:
        from codex_image.account_quota import fetch_account_quota
        from codex_image.auth import AuthState

        token = _jwt({"https://api.openai.com/auth": {"chatgpt_account_id": "acct-from-token"}})
        state = AuthState(
            path=Path("auth.json"),
            access_token=token,
            refresh_token="refresh-token",
            id_token="",
            account_id="",
            last_refresh=None,
            raw={},
        )
        transport = FakeTransport(
            [
                FakeResponse(200, b"{}"),
                FakeResponse(
                    200,
                    json.dumps(
                        {
                            "rate_limit": {
                                "primary_window": {"used_percent": 25},
                            },
                        }
                    ).encode("utf-8"),
                ),
            ]
        )

        fetch_account_quota(state, transport=transport)

        self.assertEqual(transport.requests[1]["headers"]["ChatGPT-Account-Id"], "acct-from-token")

    def test_quota_from_auth_state_snapshot_reads_cockpit_cached_quota(self) -> None:
        from codex_image.account_quota import quota_from_auth_state_snapshot
        from codex_image.auth import AuthState

        state = AuthState(
            path=Path("account.json"),
            access_token="secret-access",
            refresh_token="secret-refresh",
            id_token="",
            account_id="acct-123",
            last_refresh=None,
            raw={
                "email": "user@example.com",
                "plan_type": "plus",
                "usage_updated_at": 1800001234,
                "quota": {
                    "hourly_percentage": 99,
                    "hourly_reset_time": 1800000000,
                    "hourly_window_minutes": 300,
                    "hourly_window_present": True,
                    "weekly_percentage": 52,
                    "weekly_reset_time": 1800600000,
                    "weekly_window_minutes": 10080,
                    "weekly_window_present": True,
                    "raw_data": {
                        "user_id": "user-1",
                        "plan_type": "plus",
                    },
                },
            },
        )

        quota = quota_from_auth_state_snapshot(state)

        self.assertIsNotNone(quota)
        assert quota is not None
        self.assertEqual(quota["status"], "ok")
        self.assertTrue(quota["quota_known"])
        self.assertEqual(quota["codex_5h_percent"], 99)
        self.assertEqual(quota["codex_week_percent"], 52)
        self.assertEqual(quota["codex_limits"]["five_hour"]["reset_after"], "2027-01-15T08:00:00+00:00")
        self.assertEqual(quota["codex_limits"]["week"]["window_minutes"], 10080)
        self.assertEqual(quota["last_refreshed_at"], "2027-01-15T08:20:34+00:00")
        self.assertEqual(quota["plan"], "plus")
        self.assertEqual(quota["email"], "user@example.com")
        self.assertNotIn("secret-access", json.dumps(quota))
        self.assertNotIn("secret-refresh", json.dumps(quota))

    def test_quota_cache_redacts_tokens_and_marks_limited(self) -> None:
        from codex_image.account_quota import AccountQuotaCache

        with tempfile.TemporaryDirectory() as tmp:
            cache_path = Path(tmp) / "account-quota-cache.json"
            cache = AccountQuotaCache(cache_path)
            cache.set(
                {
                    "account_key": "cockpit:acct-a",
                    "auth_source": "cockpit",
                    "account_id": "acct-a",
                    "label": "Account A",
                    "status": "ok",
                    "remaining": 3,
                    "access_token": "secret-access",
                    "nested": {"refresh_token": "secret-refresh"},
                }
            )
            cache.mark_limited("cockpit:acct-a", auth_source="cockpit", account_id="acct-a", error="usage limit reached")

            raw = cache_path.read_text(encoding="utf-8")
            record = cache.get("cockpit:acct-a")

        self.assertNotIn("secret-access", raw)
        self.assertNotIn("secret-refresh", raw)
        self.assertIsNotNone(record)
        self.assertEqual(record["status"], "limited")
        self.assertEqual(record["remaining"], 0)
        self.assertEqual(record["refresh_error"], "usage limit reached")

    def test_quota_cache_skips_limited_channel_until_reset_time(self) -> None:
        from codex_image.account_quota import AccountQuotaCache

        with tempfile.TemporaryDirectory() as tmp:
            cache = AccountQuotaCache(Path(tmp) / "account-quota-cache.json", ttl_seconds=0)
            record = cache.mark_limited(
                "cockpit:acct-a",
                auth_source="cockpit",
                account_id="acct-a",
                error="Codex usage limit reached: The usage limit has been reached (plan plus; resets in 9h 3m)",
            )

            usable = cache.is_channel_usable("cockpit:acct-a")

        self.assertFalse(usable)
        self.assertEqual(record["status"], "limited")
        self.assertEqual(record["remaining"], 0)
        self.assertGreater(datetime.fromisoformat(record["reset_after"]), datetime.now(UTC) + timedelta(hours=8))

    def test_quota_cache_allows_limited_channel_after_reset_time_passes(self) -> None:
        from codex_image.account_quota import AccountQuotaCache

        with tempfile.TemporaryDirectory() as tmp:
            cache = AccountQuotaCache(Path(tmp) / "account-quota-cache.json", ttl_seconds=300)
            cache.set(
                {
                    "account_key": "cockpit:acct-a",
                    "auth_source": "cockpit",
                    "account_id": "acct-a",
                    "label": "Account A",
                    "status": "limited",
                    "remaining": 0,
                    "quota_known": True,
                    "reset_after": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
                    "last_refreshed_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
                }
            )

            usable = cache.is_channel_usable("cockpit:acct-a")

        self.assertTrue(usable)

    def test_quota_cache_uses_legacy_refresh_error_reset_when_reset_after_is_stale(self) -> None:
        from codex_image.account_quota import AccountQuotaCache

        with tempfile.TemporaryDirectory() as tmp:
            cache = AccountQuotaCache(Path(tmp) / "account-quota-cache.json", ttl_seconds=0)
            cache.set(
                {
                    "account_key": "cockpit:acct-a",
                    "auth_source": "cockpit",
                    "account_id": "acct-a",
                    "label": "Account A",
                    "status": "limited",
                    "remaining": 0,
                    "quota_known": True,
                    "reset_after": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
                    "last_refreshed_at": datetime.now(UTC).isoformat(),
                    "refresh_error": "Codex usage limit reached: The usage limit has been reached (plan plus; resets in 9h 3m)",
                }
            )

            usable = cache.is_channel_usable("cockpit:acct-a")

        self.assertFalse(usable)

    def test_quota_cache_allows_channel_when_codex_percentages_have_capacity(self) -> None:
        from codex_image.account_quota import AccountQuotaCache

        with tempfile.TemporaryDirectory() as tmp:
            cache = AccountQuotaCache(Path(tmp) / "account-quota-cache.json", ttl_seconds=300)
            cache.set(
                {
                    "account_key": "cockpit:acct-a",
                    "auth_source": "cockpit",
                    "account_id": "acct-a",
                    "label": "Account A",
                    "status": "ok",
                    "remaining": 0,
                    "remote_remaining": 103,
                    "local_spent_since_refresh": 104,
                    "quota_known": True,
                    "codex_5h_percent": 49,
                    "codex_week_percent": 92,
                    "reset_after": (datetime.now(UTC) + timedelta(hours=4)).isoformat(),
                    "last_refreshed_at": datetime.now(UTC).isoformat(),
                }
            )

            usable = cache.is_channel_usable("cockpit:acct-a")

        self.assertTrue(usable)

    def test_quota_cache_allows_locally_limited_channel_when_codex_percentages_have_capacity(self) -> None:
        from codex_image.account_quota import AccountQuotaCache

        with tempfile.TemporaryDirectory() as tmp:
            cache = AccountQuotaCache(Path(tmp) / "account-quota-cache.json", ttl_seconds=300)
            cache.set(
                {
                    "account_key": "cockpit:acct-a",
                    "auth_source": "cockpit",
                    "account_id": "acct-a",
                    "label": "Account A",
                    "status": "limited",
                    "remaining": 0,
                    "remote_remaining": 103,
                    "local_spent_since_refresh": 106,
                    "quota_known": True,
                    "codex_5h_percent": 39,
                    "codex_week_percent": 90,
                    "reset_after": (datetime.now(UTC) + timedelta(hours=4)).isoformat(),
                    "last_refreshed_at": datetime.now(UTC).isoformat(),
                }
            )

            usable = cache.is_channel_usable("cockpit:acct-a")

        self.assertTrue(usable)

    def test_quota_cache_blocks_channel_when_codex_percentage_is_exhausted(self) -> None:
        from codex_image.account_quota import AccountQuotaCache

        with tempfile.TemporaryDirectory() as tmp:
            cache = AccountQuotaCache(Path(tmp) / "account-quota-cache.json", ttl_seconds=300)
            cache.set(
                {
                    "account_key": "cockpit:acct-a",
                    "auth_source": "cockpit",
                    "account_id": "acct-a",
                    "label": "Account A",
                    "status": "ok",
                    "remaining": 12,
                    "quota_known": True,
                    "codex_5h_percent": 0,
                    "codex_week_percent": 92,
                    "reset_after": (datetime.now(UTC) + timedelta(hours=4)).isoformat(),
                    "last_refreshed_at": datetime.now(UTC).isoformat(),
                }
            )

            usable = cache.is_channel_usable("cockpit:acct-a")

        self.assertFalse(usable)

    def test_quota_cache_keeps_local_spend_when_remote_refresh_is_unchanged(self) -> None:
        from codex_image.account_quota import AccountQuotaCache, AccountQuotaDescriptor, build_account_quota_record

        with tempfile.TemporaryDirectory() as tmp:
            cache = AccountQuotaCache(Path(tmp) / "account-quota-cache.json")
            descriptor = AccountQuotaDescriptor(
                account_key="cockpit:acct-a",
                auth_source="cockpit",
                account_id="acct-a",
                label="Account A",
            )
            initial = build_account_quota_record(
                descriptor,
                {
                    "status": "ok",
                    "remaining": 120,
                    "reset_after": "2099-05-13T23:28:48Z",
                    "quota_known": True,
                    "plan": "plus",
                },
            )
            cache.set(initial)

            decremented = cache.decrement_remaining("cockpit:acct-a", 3, auth_source="cockpit", account_id="acct-a")
            refreshed = build_account_quota_record(
                descriptor,
                {
                    "status": "ok",
                    "remaining": 120,
                    "reset_after": "2099-05-13T23:30:00Z",
                    "quota_known": True,
                    "plan": "plus",
                },
                cached=decremented,
            )

        self.assertEqual(decremented["remaining"], 117)
        self.assertEqual(decremented["remote_remaining"], 120)
        self.assertEqual(decremented["local_spent_since_refresh"], 3)
        self.assertEqual(refreshed["remaining"], 117)
        self.assertEqual(refreshed["local_spent_since_refresh"], 3)

    def test_quota_cache_manual_disable_overrides_stale_cache_and_refresh(self) -> None:
        from codex_image.account_quota import AccountQuotaCache, AccountQuotaDescriptor, build_account_quota_record

        with tempfile.TemporaryDirectory() as tmp:
            cache = AccountQuotaCache(Path(tmp) / "account-quota-cache.json", ttl_seconds=0)
            descriptor = AccountQuotaDescriptor(
                account_key="cockpit:acct-a",
                auth_source="cockpit",
                account_id="acct-a",
                label="Account A",
            )
            cache.set(
                build_account_quota_record(
                    descriptor,
                    {
                        "status": "ok",
                        "remaining": 50,
                        "quota_known": True,
                        "plan": "plus",
                    },
                )
            )

            disabled = cache.set_manual_disabled("cockpit:acct-a", True, auth_source="cockpit", account_id="acct-a")
            refreshed = build_account_quota_record(
                descriptor,
                {
                    "status": "ok",
                    "remaining": 50,
                    "quota_known": True,
                    "plan": "plus",
                },
                cached=disabled,
            )
            cache.set(refreshed)
            disabled_usable = cache.is_channel_usable("cockpit:acct-a")
            reenabled = cache.set_manual_disabled("cockpit:acct-a", False, auth_source="cockpit", account_id="acct-a")
            enabled_usable = cache.is_channel_usable("cockpit:acct-a")

        self.assertTrue(disabled["manual_disabled"])
        self.assertFalse(disabled["queue_enabled"])
        self.assertTrue(refreshed["manual_disabled"])
        self.assertFalse(refreshed["queue_enabled"])
        self.assertFalse(disabled_usable)
        self.assertFalse(reenabled["manual_disabled"])
        self.assertTrue(reenabled["queue_enabled"])
        self.assertTrue(enabled_usable)

    def test_build_account_quota_record_preserves_cached_codex_percentages(self) -> None:
        from codex_image.account_quota import AccountQuotaDescriptor, build_account_quota_record

        descriptor = AccountQuotaDescriptor(
            account_key="cockpit:acct-a",
            auth_source="cockpit",
            account_id="acct-a",
            label="Account A",
        )

        record = build_account_quota_record(
            descriptor,
            None,
            cached={
                "status": "ok",
                "codex_5h_percent": 64,
                "codex_week_percent": 21,
                "codex_limits": {
                    "five_hour": {"percent": 64, "reset_after": "PT1H"},
                    "week": {"percent": 21, "reset_after": "P2D"},
                },
            },
        )

        self.assertEqual(record["codex_5h_percent"], 64)
        self.assertEqual(record["codex_week_percent"], 21)
        self.assertEqual(record["codex_limits"]["five_hour"]["percent"], 64)


if __name__ == "__main__":
    unittest.main()
