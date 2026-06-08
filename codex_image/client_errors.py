from __future__ import annotations

import json
from typing import Any

from .http import HTTPResponse

def _response_body_text(response: HTTPResponse) -> str:
    return response.body.decode("utf-8", errors="replace")


def _usage_limit_error(response: HTTPResponse) -> dict[str, Any] | None:
    if response.status != 429:
        return None
    body_text = _response_body_text(response)
    try:
        payload = json.loads(body_text)
    except json.JSONDecodeError:
        return {"message": body_text} if "usage_limit_reached" in body_text else None
    if not isinstance(payload, dict):
        return None
    error = payload.get("error")
    if not isinstance(error, dict):
        return None
    error_type = str(error.get("type") or error.get("code") or "").strip()
    message = str(error.get("message") or "").strip()
    if error_type == "usage_limit_reached" or "usage limit" in message.lower():
        return error
    return None


def _format_reset_seconds(value: Any) -> str:
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return ""
    if seconds <= 0:
        return ""
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    if not parts:
        parts.append(f"{seconds}s")
    return " ".join(parts)


def _format_codex_usage_limit_error(error: dict[str, Any]) -> str:
    message = str(error.get("message") or "The usage limit has been reached").strip()
    details: list[str] = []
    plan_type = str(error.get("plan_type") or "").strip()
    if plan_type:
        details.append(f"plan {plan_type}")
    reset_text = _format_reset_seconds(error.get("resets_in_seconds"))
    if reset_text:
        details.append(f"resets in {reset_text}")
    suffix = f" ({'; '.join(details)})" if details else ""
    return f"Codex usage limit reached: {message}{suffix}"
