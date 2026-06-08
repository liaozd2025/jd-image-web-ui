from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .auth import AuthState, decode_jwt_claims
from .client import CODEX_USER_AGENT
from .http import Transport, UrllibTransport

CHATGPT_ME_URL = "https://chatgpt.com/backend-api/me"
CHATGPT_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
DEFAULT_CACHE_TTL_SECONDS = 300
LIMITED_QUOTA_STATUSES = {"limited", "disabled", "error"}
TOKEN_FIELD_NAMES = {"access_token", "refresh_token", "id_token", "authorization", "api_key", "openai_api_key"}
IMAGE_QUOTA_FEATURES = ("image_gen", "odyssey")
CODEX_PERCENT_KEYS = (
    "used_percent",
    "usage_percent",
    "percent_used",
    "used_percentage",
    "usage_percentage",
    "consumed_percent",
    "consumed_percentage",
    "percentage",
    "percent",
)
CODEX_REMAINING_PERCENT_KEYS = ("remaining_percent", "remaining_percentage", "percent_remaining")
RESET_IN_PATTERN = re.compile(r"resets?\s+in\s+([^;)]+)", re.IGNORECASE)
RESET_DURATION_TOKEN_PATTERN = re.compile(
    r"(\d+)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class AccountQuotaDescriptor:
    account_key: str
    auth_source: str
    account_id: str | None
    label: str
    auth_state: AuthState | None = None


class AccountQuotaCache:
    def __init__(self, path: Path, *, ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS) -> None:
        self.path = path
        self.ttl_seconds = ttl_seconds

    def get(self, account_key: str) -> dict[str, Any] | None:
        record = self.read().get("accounts", {}).get(account_key)
        return _normalize_account_queue_flags(_normalize_cached_reset_after(dict(record))) if isinstance(record, dict) else None

    def set(self, record: dict[str, Any]) -> dict[str, Any]:
        clean = _normalize_account_queue_flags(_sanitize_public_record(record))
        account_key = str(clean.get("account_key") or "").strip()
        if not account_key:
            raise ValueError("account_key is required")
        payload = self.read()
        accounts = payload.setdefault("accounts", {})
        if not isinstance(accounts, dict):
            accounts = {}
            payload["accounts"] = accounts
        accounts[account_key] = clean
        self.write(payload)
        return clean

    def set_manual_disabled(
        self,
        account_key: str,
        disabled: bool,
        *,
        auth_source: str | None = None,
        account_id: str | None = None,
    ) -> dict[str, Any]:
        existing = self.get(account_key) or {}
        record = {
            **existing,
            "account_key": account_key,
            "auth_source": auth_source or existing.get("auth_source") or "",
            "account_id": account_id if account_id is not None else existing.get("account_id"),
            "label": existing.get("label") or _default_account_label(account_key),
            "manual_disabled": bool(disabled),
            "manual_disabled_updated_at": _utc_now_iso(),
        }
        return self.set(record)

    def mark_limited(
        self,
        account_key: str,
        *,
        auth_source: str | None = None,
        account_id: str | None = None,
        error: str = "",
    ) -> dict[str, Any]:
        existing = self.get(account_key) or {}
        record = {
            **existing,
            "account_key": account_key,
            "auth_source": auth_source or existing.get("auth_source") or "",
            "account_id": account_id if account_id is not None else existing.get("account_id"),
            "label": existing.get("label") or _default_account_label(account_key),
            "status": "limited",
            "remaining": 0,
            "quota_known": True,
            "reset_after": _first_non_empty(_reset_after_from_usage_error(error), existing.get("reset_after")),
            "refresh_error": str(error or "usage limit reached"),
            "last_refreshed_at": _utc_now_iso(),
        }
        return self.set(record)

    def decrement_remaining(
        self,
        account_key: str,
        count: int,
        *,
        auth_source: str | None = None,
        account_id: str | None = None,
    ) -> dict[str, Any] | None:
        if count <= 0:
            return self.get(account_key)
        existing = self.get(account_key)
        if not isinstance(existing, dict):
            return None

        remote_remaining = _optional_int(existing.get("remote_remaining"))
        displayed_remaining = _optional_int(existing.get("remaining"))
        base_remaining = remote_remaining if remote_remaining is not None else displayed_remaining
        if base_remaining is None:
            return existing

        local_spent = max(0, _optional_int(existing.get("local_spent_since_refresh")) or 0) + count
        remaining = max(0, base_remaining - local_spent)
        status = str(existing.get("status") or "unknown").lower()
        if remaining == 0 and bool(existing.get("quota_known")):
            status = "limited"
        elif status == "limited" and remaining > 0:
            status = "ok"

        record = {
            **existing,
            "account_key": account_key,
            "auth_source": auth_source or existing.get("auth_source") or "",
            "account_id": account_id if account_id is not None else existing.get("account_id"),
            "status": status,
            "remaining": remaining,
            "remote_remaining": base_remaining,
            "local_spent_since_refresh": local_spent,
            "local_updated_at": _utc_now_iso(),
        }
        return self.set(record)

    def is_record_fresh(self, record: dict[str, Any] | None) -> bool:
        if not isinstance(record, dict):
            return False
        refreshed_at = _parse_datetime(str(record.get("last_refreshed_at") or ""))
        if refreshed_at is None:
            return False
        return datetime.now(UTC) - refreshed_at <= timedelta(seconds=self.ttl_seconds)

    def is_channel_usable(self, channel_id: str) -> bool:
        record = self.get(channel_id)
        if not isinstance(record, dict):
            return True
        if bool(record.get("manual_disabled")):
            return False
        status = str(record.get("status") or "").lower()
        remaining = _optional_int(record.get("remaining"))
        codex_capacity = _codex_capacity_state(record)
        status_blocks_channel = _quota_status_blocks_channel(status, codex_capacity)
        reset_at = _parse_datetime(str(record.get("reset_after") or ""))
        reset_pending = reset_at is not None and reset_at > datetime.now(UTC)
        reset_passed = reset_at is not None and reset_at <= datetime.now(UTC)
        if reset_pending and (
            status_blocks_channel
            or codex_capacity == "exhausted"
            or (remaining is not None and remaining <= 0 and codex_capacity != "available")
        ):
            return False
        if reset_passed and (
            (status == "limited" and codex_capacity != "available")
            or codex_capacity == "exhausted"
            or (remaining is not None and remaining <= 0 and codex_capacity != "available")
        ):
            return True
        if not self.is_record_fresh(record):
            return True
        if status_blocks_channel:
            return False
        if codex_capacity == "exhausted":
            return False
        if remaining is not None and remaining <= 0:
            if codex_capacity == "available":
                return True
            return False
        return True

    def read(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {"version": 1, "accounts": {}}
        if not isinstance(payload, dict):
            return {"version": 1, "accounts": {}}
        accounts = payload.get("accounts")
        if not isinstance(accounts, dict):
            payload["accounts"] = {}
        payload["version"] = 1
        return payload

    def write(self, payload: dict[str, Any]) -> None:
        clean = _sanitize_public_record(payload)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_name(f".{self.path.name}.{os.getpid()}.tmp")
        tmp_path.write_text(json.dumps(clean, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp_path.replace(self.path)


def fetch_account_quota(
    auth_state: AuthState,
    *,
    transport: Transport | None = None,
) -> dict[str, Any]:
    snapshot_quota = quota_from_auth_state_snapshot(auth_state)
    transport = transport or UrllibTransport()
    try:
        me_payload = _request_json(
            transport,
            method="GET",
            url=CHATGPT_ME_URL,
            auth_state=auth_state,
            body=b"",
        )
        usage_payload = _request_json(
            transport,
            method="GET",
            url=CHATGPT_USAGE_URL,
            auth_state=auth_state,
            body=b"",
        )
    except Exception:
        if snapshot_quota is not None:
            return snapshot_quota
        raise
    limits = _find_limits_progress(usage_payload) or _find_limits_progress(me_payload)
    image_limit = _image_gen_limit(limits)
    snapshot_limits = snapshot_quota.get("codex_limits") if isinstance(snapshot_quota, dict) else {}
    codex_limits = _codex_limits_from_usage(usage_payload) or _codex_limits(limits) or snapshot_limits
    remaining = _optional_int(image_limit.get("remaining") if image_limit else None)
    status = _codex_status_from_usage(usage_payload, codex_limits)
    reset_after = _first_non_empty(
        _codex_reset_after(codex_limits, exhausted_only=status == "limited"),
        image_limit.get("reset_after") if image_limit else None,
        image_limit.get("resetAfter") if image_limit else None,
        image_limit.get("reset_at") if image_limit else None,
    )
    if status == "unknown" and remaining is not None:
        status = "limited" if remaining <= 0 else "ok"
    return {
        "status": status,
        "remaining": remaining,
        "reset_after": reset_after,
        "quota_known": bool(codex_limits) or (image_limit is not None and remaining is not None),
        "plan": _detect_plan(auth_state, me_payload, usage_payload),
        "email": _detect_email(auth_state, me_payload, usage_payload),
        "user_id": _detect_user_id(auth_state, me_payload, usage_payload),
        "raw_limit": _sanitize_public_record(image_limit or usage_payload or {}),
        "codex_limits": codex_limits,
        "codex_5h_percent": _optional_int(codex_limits.get("five_hour", {}).get("percent")),
        "codex_week_percent": _optional_int(codex_limits.get("week", {}).get("percent")),
    }


def quota_from_auth_state_snapshot(auth_state: AuthState) -> dict[str, Any] | None:
    raw = auth_state.raw if isinstance(auth_state.raw, dict) else {}
    quota = raw.get("quota")
    if not isinstance(quota, dict):
        return None

    raw_data = quota.get("raw_data")
    if not isinstance(raw_data, dict):
        raw_data = {}
    codex_limits = _codex_limits_from_cockpit_quota(quota) or _codex_limits_from_usage(raw_data)
    if not codex_limits:
        return None

    status = _codex_status_from_usage(raw_data, codex_limits)
    if status == "unknown":
        known_percentages = [
            percent
            for percent in (_optional_int(item.get("percent")) for item in codex_limits.values())
            if percent is not None
        ]
        status = "limited" if any(percent <= 0 for percent in known_percentages) else "ok"
    reset_after = _codex_reset_after(codex_limits, exhausted_only=status == "limited")
    return {
        "status": status,
        "remaining": None,
        "reset_after": reset_after,
        "quota_known": True,
        "plan": _detect_plan(auth_state, raw_data, quota, raw),
        "email": _detect_email(auth_state, raw_data, quota, raw),
        "user_id": _detect_user_id(auth_state, raw_data, quota, raw),
        "raw_limit": _sanitize_public_record(quota),
        "codex_limits": codex_limits,
        "codex_5h_percent": _optional_int(codex_limits.get("five_hour", {}).get("percent")),
        "codex_week_percent": _optional_int(codex_limits.get("week", {}).get("percent")),
        "last_refreshed_at": _timestamp_iso(raw.get("usage_updated_at")),
    }


def build_account_quota_record(
    descriptor: AccountQuotaDescriptor,
    quota: dict[str, Any] | None,
    *,
    cached: dict[str, Any] | None = None,
    refresh_error: str = "",
) -> dict[str, Any]:
    cached = cached if isinstance(cached, dict) else {}
    quota = quota if isinstance(quota, dict) else {}
    remote_remaining = _optional_int(quota.get("remaining"))
    status = str(quota.get("status") or ("error" if refresh_error else cached.get("status") or "unknown")).lower()
    remaining = remote_remaining
    if remaining is None:
        remaining = _optional_int(cached.get("remaining"))
    reset_after = _first_non_empty(quota.get("reset_after"), cached.get("reset_after"))
    local_spent = _local_spent_after_remote_refresh(
        cached,
        remote_remaining=remote_remaining,
        reset_after=reset_after,
        refresh_error=refresh_error,
    )
    if remote_remaining is not None:
        remaining = max(0, remote_remaining - local_spent)
        if remaining == 0 and bool(quota.get("quota_known")):
            status = "limited"
        elif status == "limited" and remaining > 0:
            status = "ok"
    manual_disabled = bool(cached.get("manual_disabled"))
    codex_limits = _sanitize_public_record(quota.get("codex_limits") or cached.get("codex_limits") or {})
    record = {
        "account_key": descriptor.account_key,
        "auth_source": descriptor.auth_source,
        "account_id": descriptor.account_id,
        "label": descriptor.label,
        "status": status,
        "remaining": remaining,
        "remote_remaining": remote_remaining if remote_remaining is not None else _optional_int(cached.get("remote_remaining")),
        "local_spent_since_refresh": local_spent,
        "reset_after": reset_after,
        "quota_known": bool(quota.get("quota_known")) or bool(cached.get("quota_known") and not refresh_error),
        "plan": _first_non_empty(quota.get("plan"), cached.get("plan"), "unknown"),
        "email": _first_non_empty(quota.get("email"), cached.get("email")),
        "user_id": _first_non_empty(quota.get("user_id"), cached.get("user_id")),
        "raw_limit": _sanitize_public_record(quota.get("raw_limit") or cached.get("raw_limit") or {}),
        "codex_limits": codex_limits,
        "codex_5h_percent": _first_optional_int(quota.get("codex_5h_percent"), cached.get("codex_5h_percent")),
        "codex_week_percent": _first_optional_int(quota.get("codex_week_percent"), cached.get("codex_week_percent")),
        "last_refreshed_at": (
            _first_non_empty(quota.get("last_refreshed_at"), _utc_now_iso())
            if quota or refresh_error
            else cached.get("last_refreshed_at") or ""
        ),
        "refresh_error": str(refresh_error or ""),
        "manual_disabled": manual_disabled,
        "queue_enabled": not manual_disabled,
        "manual_disabled_updated_at": cached.get("manual_disabled_updated_at") or "",
    }
    return _sanitize_public_record(record)


def public_account_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    enabled_items = [item for item in items if not bool(item.get("manual_disabled"))]
    known_remaining = [
        remaining
        for remaining in (_optional_int(item.get("remaining")) for item in enabled_items)
        if remaining is not None
    ]
    return {
        "count": len(items),
        "ok_count": sum(1 for item in enabled_items if str(item.get("status") or "").lower() == "ok"),
        "limited_count": sum(1 for item in enabled_items if str(item.get("status") or "").lower() == "limited"),
        "unknown_count": sum(1 for item in enabled_items if str(item.get("status") or "").lower() == "unknown"),
        "disabled_count": sum(1 for item in items if bool(item.get("manual_disabled"))),
        "remaining": sum(known_remaining) if known_remaining else None,
    }


def merge_descriptor_with_cached_record(descriptor: AccountQuotaDescriptor, cached: dict[str, Any] | None) -> dict[str, Any]:
    return build_account_quota_record(descriptor, None, cached=cached)


def _request_json(
    transport: Transport,
    *,
    method: str,
    url: str,
    auth_state: AuthState,
    body: bytes,
) -> Any:
    response = transport.request(
        method=method,
        url=url,
        headers=_quota_headers(auth_state),
        body=body,
    )
    if response.status < 200 or response.status >= 300:
        raise RuntimeError(f"Account quota request failed: HTTP {response.status}")
    if not response.body:
        return {}
    try:
        return json.loads(response.body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Account quota request returned invalid JSON") from exc


def _quota_headers(auth_state: AuthState) -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {auth_state.access_token}",
        "Content-Type": "application/json",
        "Origin": "https://chatgpt.com",
        "Referer": "https://chatgpt.com/",
        "User-Agent": CODEX_USER_AGENT,
        "OAI-Language": "zh-CN",
    }
    account_id = _chatgpt_account_id(auth_state)
    if account_id:
        headers["ChatGPT-Account-Id"] = account_id
    return headers


def _find_limits_progress(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        limits = value.get("limits_progress")
        if isinstance(limits, list):
            return [item for item in limits if isinstance(item, dict)]
        for item in value.values():
            found = _find_limits_progress(item)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_limits_progress(item)
            if found:
                return found
    return []


def _image_gen_limit(limits: list[dict[str, Any]]) -> dict[str, Any] | None:
    fallback: dict[str, Any] | None = None
    for item in limits:
        feature = str(
            item.get("feature_name")
            or item.get("feature")
            or item.get("name")
            or item.get("key")
            or ""
        ).lower()
        if feature == "image_gen":
            return item
        if fallback is None and feature in IMAGE_QUOTA_FEATURES:
            fallback = item
    return fallback


def _codex_limits(limits: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    windows: dict[str, dict[str, Any]] = {}
    for item in limits:
        window = _codex_window_key(item)
        if not window or window in windows:
            continue
        percent = _codex_used_percent(item)
        if percent is None:
            continue
        windows[window] = {
            "percent": percent,
            "reset_after": _first_non_empty(
                item.get("reset_after"),
                item.get("resetAfter"),
                item.get("reset_at"),
                item.get("resetAt"),
                item.get("resets_at"),
                item.get("resetsAt"),
            ),
            "raw_limit": _sanitize_public_record(item),
        }
    return windows


def _codex_limits_from_usage(value: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(value, dict):
        return {}
    rate_limit = value.get("rate_limit")
    if not isinstance(rate_limit, dict):
        return {}

    windows: dict[str, dict[str, Any]] = {}
    for key, source_key in (("five_hour", "primary_window"), ("week", "secondary_window")):
        window = rate_limit.get(source_key)
        if not isinstance(window, dict):
            continue
        percent = _usage_window_remaining_percent(window)
        if percent is None:
            continue
        windows[key] = {
            "percent": percent,
            "reset_after": _usage_window_reset_after(window),
            "window_minutes": _usage_window_minutes(window),
            "raw_limit": _sanitize_public_record(window),
        }
    return windows


def _codex_limits_from_cockpit_quota(value: dict[str, Any]) -> dict[str, dict[str, Any]]:
    windows: dict[str, dict[str, Any]] = {}
    for key, prefix in (("five_hour", "hourly"), ("week", "weekly")):
        present = value.get(f"{prefix}_window_present")
        percent = _optional_int(value.get(f"{prefix}_percentage"))
        if percent is None and present is False:
            continue
        if percent is None:
            continue
        window: dict[str, Any] = {
            "percent": _clamped_percent(percent),
            "reset_after": _timestamp_iso(value.get(f"{prefix}_reset_time")),
            "window_minutes": _optional_int(value.get(f"{prefix}_window_minutes")),
            "raw_limit": _sanitize_public_record(
                {
                    f"{prefix}_percentage": value.get(f"{prefix}_percentage"),
                    f"{prefix}_reset_time": value.get(f"{prefix}_reset_time"),
                    f"{prefix}_window_minutes": value.get(f"{prefix}_window_minutes"),
                    f"{prefix}_window_present": value.get(f"{prefix}_window_present"),
                }
            ),
        }
        windows[key] = window
    return windows


def _codex_status_from_usage(value: Any, limits: dict[str, dict[str, Any]]) -> str:
    rate_limit = value.get("rate_limit") if isinstance(value, dict) else None
    if isinstance(rate_limit, dict):
        if rate_limit.get("allowed") is False or rate_limit.get("limit_reached") is True:
            return "limited"
    if not limits:
        return "unknown"
    percentages = [_optional_int(item.get("percent")) for item in limits.values()]
    known = [percent for percent in percentages if percent is not None]
    if not known:
        return "unknown"
    return "limited" if any(percent <= 0 for percent in known) else "ok"


def _codex_reset_after(limits: dict[str, dict[str, Any]], *, exhausted_only: bool = False) -> str:
    candidates: list[datetime] = []
    for item in limits.values():
        percent = _optional_int(item.get("percent"))
        if exhausted_only and (percent is None or percent > 0):
            continue
        reset_at = _parse_datetime(str(item.get("reset_after") or ""))
        if reset_at is not None:
            candidates.append(reset_at)
    if not candidates:
        return ""
    return min(candidates).isoformat()


def _usage_window_remaining_percent(window: dict[str, Any]) -> int | None:
    for key in CODEX_REMAINING_PERCENT_KEYS:
        remaining = _optional_float(window.get(key))
        if remaining is not None:
            return _clamped_percent(remaining)
    used = _optional_float(window.get("used_percent"))
    if used is None:
        used = _optional_float(window.get("usedPercentage"))
    if used is None:
        used = 0.0
    return _clamped_percent(100 - used)


def _usage_window_minutes(window: dict[str, Any]) -> int | None:
    seconds = _optional_float(window.get("limit_window_seconds"))
    if seconds is None:
        seconds = _optional_float(window.get("limitWindowSeconds"))
    if seconds is None or seconds <= 0:
        return None
    return int((seconds + 59) // 60)


def _usage_window_reset_after(window: dict[str, Any]) -> str:
    reset_at = _optional_float(window.get("reset_at"))
    if reset_at is None:
        reset_at = _optional_float(window.get("resetAt"))
    if reset_at is not None and reset_at > 0:
        return datetime.fromtimestamp(reset_at, UTC).isoformat()

    reset_after_seconds = _optional_float(window.get("reset_after_seconds"))
    if reset_after_seconds is None:
        reset_after_seconds = _optional_float(window.get("resetAfterSeconds"))
    if reset_after_seconds is not None and reset_after_seconds >= 0:
        return (datetime.now(UTC) + timedelta(seconds=reset_after_seconds)).isoformat()

    return _first_non_empty(
        window.get("reset_after"),
        window.get("resetAfter"),
        window.get("resets_at"),
        window.get("resetsAt"),
    )


def _timestamp_iso(value: Any) -> str:
    timestamp = _optional_float(value)
    if timestamp is None or timestamp <= 0:
        return ""
    return datetime.fromtimestamp(timestamp, UTC).isoformat()


def _codex_window_key(item: dict[str, Any]) -> str:
    text = _quota_item_text(item)
    if "codex" not in text:
        return ""
    if any(token in text for token in ("5h", "5_h", "5-h", "5 hour", "5-hour", "five_hour", "five hour")):
        return "five_hour"
    if any(token in text for token in ("week", "weekly", "7d", "7_d", "7-day", "7 day")):
        return "week"
    return ""


def _quota_item_text(item: dict[str, Any]) -> str:
    keys = ("feature_name", "feature", "name", "key", "slug", "window", "period", "bucket", "limit_type")
    parts = [str(item.get(key) or "") for key in keys]
    try:
        parts.append(json.dumps(item, ensure_ascii=False, sort_keys=True))
    except (TypeError, ValueError):
        pass
    return " ".join(parts).replace("_", " ").lower()


def _codex_used_percent(item: dict[str, Any]) -> int | None:
    for key in CODEX_PERCENT_KEYS:
        value = _optional_float(item.get(key))
        if value is not None:
            return _clamped_percent(value)
    for key in CODEX_REMAINING_PERCENT_KEYS:
        value = _optional_float(item.get(key))
        if value is not None:
            return _clamped_percent(100 - value)

    limit = _optional_float(_first_existing(item, "limit", "total", "max", "quota", "capacity"))
    if limit is None or limit <= 0:
        return None
    used = _optional_float(_first_existing(item, "used", "usage", "current", "consumed"))
    if used is None:
        remaining = _optional_float(_first_existing(item, "remaining", "available", "left"))
        if remaining is None:
            return None
        used = max(0.0, limit - remaining)
    return _clamped_percent((used / limit) * 100)


def _detect_plan(auth_state: AuthState, *payloads: Any) -> str:
    claims = [decode_jwt_claims(auth_state.access_token), decode_jwt_claims(auth_state.id_token)]
    for value in list(claims) + list(payloads):
        detected = _find_plan_value(value)
        if detected:
            return detected
    return "unknown"


def _find_plan_value(value: Any) -> str:
    if isinstance(value, dict):
        for key, item in value.items():
            key_l = str(key).lower()
            if key_l in {"plan", "plan_type", "account_type", "chatgpt_plan_type", "workspace_plan", "subscription_plan"}:
                normalized = _normalize_plan(item)
                if normalized:
                    return normalized
            found = _find_plan_value(item)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_plan_value(item)
            if found:
                return found
    return ""


def _normalize_plan(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    for candidate in ("enterprise", "business", "team", "pro", "plus", "free", "personal"):
        if candidate in text:
            return candidate
    return text[:40]


def _detect_email(auth_state: AuthState, *payloads: Any) -> str:
    claims = [decode_jwt_claims(auth_state.id_token), decode_jwt_claims(auth_state.access_token)]
    return str(_find_value_by_keys(list(claims) + list(payloads), {"email"}) or "")


def _detect_user_id(auth_state: AuthState, *payloads: Any) -> str:
    claims = [decode_jwt_claims(auth_state.id_token), decode_jwt_claims(auth_state.access_token)]
    return str(_find_value_by_keys(list(claims) + list(payloads), {"user_id", "id", "sub"}) or "")


def _chatgpt_account_id(auth_state: AuthState) -> str:
    if auth_state.account_id:
        return auth_state.account_id
    claims = decode_jwt_claims(auth_state.access_token)
    auth_claim = claims.get("https://api.openai.com/auth")
    if isinstance(auth_claim, dict):
        return str(auth_claim.get("chatgpt_account_id") or auth_claim.get("account_id") or "")
    return str(claims.get("account_id") or "")


def _find_value_by_keys(values: list[Any], keys: set[str]) -> Any:
    for value in values:
        found = _find_value_by_keys_recursive(value, keys)
        if found not in (None, ""):
            return found
    return ""


def _find_value_by_keys_recursive(value: Any, keys: set[str]) -> Any:
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in keys and item not in (None, ""):
                return item
        for item in value.values():
            found = _find_value_by_keys_recursive(item, keys)
            if found not in (None, ""):
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_value_by_keys_recursive(item, keys)
            if found not in (None, ""):
                return found
    return ""


def _sanitize_public_record(value: Any) -> Any:
    if isinstance(value, dict):
        clean: dict[str, Any] = {}
        for key, item in value.items():
            if str(key).lower() in TOKEN_FIELD_NAMES:
                continue
            clean[str(key)] = _sanitize_public_record(item)
        return clean
    if isinstance(value, list):
        return [_sanitize_public_record(item) for item in value]
    return value


def _normalize_account_queue_flags(record: dict[str, Any]) -> dict[str, Any]:
    if "account_key" not in record:
        return record
    manual_disabled = bool(record.get("manual_disabled"))
    record["manual_disabled"] = manual_disabled
    record["queue_enabled"] = not manual_disabled
    return record


def _codex_capacity_state(record: dict[str, Any]) -> str:
    percentages: list[int] = []
    for key in ("codex_5h_percent", "codex_week_percent"):
        percent = _optional_int(record.get(key))
        if percent is not None:
            percentages.append(percent)
    limits = record.get("codex_limits")
    if isinstance(limits, dict):
        for item in limits.values():
            if not isinstance(item, dict):
                continue
            percent = _optional_int(item.get("percent"))
            if percent is not None:
                percentages.append(percent)
    if not percentages:
        return "unknown"
    return "exhausted" if any(percent <= 0 for percent in percentages) else "available"


def _quota_status_blocks_channel(status: str, codex_capacity: str) -> bool:
    if status in {"disabled", "error"}:
        return True
    if status == "limited":
        return codex_capacity != "available"
    return False


def _local_spent_after_remote_refresh(
    cached: dict[str, Any],
    *,
    remote_remaining: int | None,
    reset_after: str,
    refresh_error: str,
) -> int:
    local_spent = max(0, _optional_int(cached.get("local_spent_since_refresh")) or 0)
    if remote_remaining is None or refresh_error:
        return local_spent

    cached_reset_after = str(cached.get("reset_after") or "")
    cached_remote = _optional_int(cached.get("remote_remaining"))
    cached_displayed = _optional_int(cached.get("remaining"))
    if cached_remote is None and cached_displayed is not None:
        cached_remote = cached_displayed + local_spent

    cached_reset_time = _parse_datetime(cached_reset_after)
    cached_reset_passed = cached_reset_time is not None and cached_reset_time <= datetime.now(UTC)
    remote_caught_up = cached_remote is not None and remote_remaining < cached_remote
    remote_reset_upward = cached_remote is not None and remote_remaining > cached_remote
    if cached_reset_passed or remote_caught_up or remote_reset_upward:
        return 0
    return local_spent


def _optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clamped_percent(value: float) -> int:
    return int(round(min(100.0, max(0.0, value))))


def _first_optional_int(*values: Any) -> int | None:
    for value in values:
        parsed = _optional_int(value)
        if parsed is not None:
            return parsed
    return None


def _first_existing(item: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in item:
            return item.get(key)
    return None


def _first_non_empty(*values: Any) -> str:
    for value in values:
        if value not in (None, ""):
            return str(value)
    return ""


def _default_account_label(account_key: str) -> str:
    if account_key == "codex:local":
        return "Codex 本机"
    if account_key.startswith("cockpit:"):
        return f"Cockpit {account_key.removeprefix('cockpit:')}"
    return account_key


def _normalize_cached_reset_after(record: dict[str, Any]) -> dict[str, Any]:
    existing_reset = _parse_datetime(str(record.get("reset_after") or ""))
    derived_reset = _reset_datetime_from_usage_error(
        str(record.get("refresh_error") or ""),
        base=_parse_datetime(str(record.get("last_refreshed_at") or "")),
    )
    if derived_reset is None:
        return record
    now = datetime.now(UTC)
    if existing_reset is None or (existing_reset <= now < derived_reset):
        record["reset_after"] = derived_reset.isoformat()
    return record


def _reset_after_from_usage_error(error: str) -> str:
    reset_at = _reset_datetime_from_usage_error(error)
    return reset_at.isoformat() if reset_at is not None else ""


def _reset_datetime_from_usage_error(error: str, *, base: datetime | None = None) -> datetime | None:
    match = RESET_IN_PATTERN.search(str(error or ""))
    if match is None:
        return None
    seconds = 0
    for amount_text, unit_text in RESET_DURATION_TOKEN_PATTERN.findall(match.group(1)):
        amount = int(amount_text)
        unit = unit_text.lower()
        if unit.startswith("d"):
            seconds += amount * 86400
        elif unit.startswith("h"):
            seconds += amount * 3600
        elif unit.startswith("m"):
            seconds += amount * 60
        elif unit.startswith("s"):
            seconds += amount
    if seconds <= 0:
        return None
    base_time = base or datetime.now(UTC)
    if base_time.tzinfo is None:
        base_time = base_time.replace(tzinfo=UTC)
    else:
        base_time = base_time.astimezone(UTC)
    return base_time + timedelta(seconds=seconds)


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _parse_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
