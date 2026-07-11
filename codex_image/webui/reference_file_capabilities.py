from __future__ import annotations

import json
import re
from typing import Any

from codex_image.client import DEFAULT_MAIN_MODEL, DEFAULT_RESPONSES_URL, ResponsesRequestError
from codex_image.client_types import normalize_openai_base_url


CapabilityKey = tuple[str, str, str, str]
_SCHEMA_TOKENS = ("input_file", "file_data", "file content part")
_REJECTION_TOKENS = ("unknown", "unsupported", "not allowed", "unrecognized")
_FILE_SPECIFIC_TOKENS = ("mime", "extension", "format", "spreadsheet", "pdf", "document type")
_ERROR_FIELDS = ("message", "code", "param", "type")
_NON_JSON_MODEL_REJECTION_TOKENS = ("unsupported_model", "unsupported model")
_NON_JSON_ECHO_START = re.compile(r"\b(?:request|payload)\s*(?:body\s*)?[:=]\s*[\[{]")
_NON_JSON_EXPLICIT_REJECTION_PATTERNS = (
    re.compile(
        r"\bunknown\s+(?:(?:content\s+type|field|parameter|param)\b\s*[:=]?\s*)?[`\"']?(?:input_file|file_data)\b"
    ),
    re.compile(
        r"[`\"']?(?:input_file|file_data)\b[`\"']?\s+(?:is\s+)?(?:not\s+allowed|unsupported|unrecognized)\b"
    ),
    re.compile(r"\b(?:unsupported|unrecognized)\s+[`\"']?(?:input_file|file_data)\b"),
)


def reference_file_capability_key(
    *,
    requested_backend: str,
    provider_id: str,
    endpoint: str,
    main_model: str,
) -> CapabilityKey:
    return (
        str(requested_backend or ""),
        str(provider_id or ""),
        str(endpoint or "").rstrip("/"),
        str(main_model or ""),
    )


def reference_file_capability_key_for_backend(
    *,
    requested_backend: str,
    provider_id: str,
    main_model: str,
    api_settings: Any,
) -> CapabilityKey:
    backend = str(requested_backend or "")
    if backend == "codex_responses":
        return reference_file_capability_key(
            requested_backend=backend,
            provider_id="codex",
            endpoint=DEFAULT_RESPONSES_URL,
            main_model=main_model,
        )
    if backend == "openai_responses":
        clean_provider_id = str(provider_id or "")
        provider = api_settings.provider_settings(clean_provider_id or None)
        return reference_file_capability_key_for_resolved_backend(
            requested_backend=backend,
            provider_id=str(provider.get("id") or ""),
            base_url=str(provider.get("base_url") or ""),
            main_model=main_model,
        )
    return reference_file_capability_key(
        requested_backend=backend,
        provider_id=str(provider_id or ""),
        endpoint="",
        main_model=main_model,
    )


def reference_file_capability_key_for_resolved_backend(
    *,
    requested_backend: str,
    provider_id: str,
    base_url: str,
    main_model: str,
) -> CapabilityKey:
    backend = str(requested_backend or "")
    if backend == "codex_responses":
        return reference_file_capability_key(
            requested_backend=backend,
            provider_id="codex",
            endpoint=DEFAULT_RESPONSES_URL,
            main_model=main_model,
        )
    if backend == "openai_responses":
        return reference_file_capability_key(
            requested_backend=backend,
            provider_id=provider_id,
            endpoint=f"{normalize_openai_base_url(base_url)}/responses",
            main_model=main_model,
        )
    return reference_file_capability_key(
        requested_backend=backend,
        provider_id=provider_id,
        endpoint="",
        main_model=main_model,
    )


def reference_file_capability_key_for_task(metadata: dict[str, Any], api_settings: Any) -> CapabilityKey:
    params = metadata.get("params") if isinstance(metadata.get("params"), dict) else {}
    return reference_file_capability_key_for_backend(
        requested_backend=str(metadata.get("requested_backend") or metadata.get("backend") or ""),
        provider_id=str(params.get("api_provider_id") or metadata.get("api_provider_id") or ""),
        main_model=effective_reference_file_main_model(params.get("main_model")),
        api_settings=api_settings,
    )


def effective_reference_file_main_model(value: Any) -> str:
    return str(value or "").strip() or DEFAULT_MAIN_MODEL


def _string_values(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _string_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from _string_values(item)


def _error_unit_text(value: Any) -> str:
    if isinstance(value, str):
        return value.lower()
    if not isinstance(value, dict):
        return ""
    parts: list[str] = []
    for field in _ERROR_FIELDS:
        parts.extend(_string_values(value.get(field)))
    return " ".join(parts).lower()


def _json_error_units(value: Any, *, root: bool = True) -> list[str]:
    if not isinstance(value, dict):
        return []
    units: list[str] = []
    if "error" in value:
        unit = _error_unit_text(value.get("error"))
        if unit:
            units.append(unit)
    elif root and any(field in value for field in ("message", "code", "param")):
        unit = _error_unit_text(value)
        if unit:
            units.append(unit)
    response = value.get("response")
    if isinstance(response, dict):
        units.extend(_json_error_units(response, root=False))
    errors = value.get("errors")
    if isinstance(errors, list):
        units.extend(unit for item in errors if (unit := _error_unit_text(item)))
    return units


def _is_schema_rejection_text(text: str) -> bool:
    return (
        any(token in text for token in _SCHEMA_TOKENS)
        and any(token in text for token in _REJECTION_TOKENS)
        and not any(token in text for token in _FILE_SPECIFIC_TOKENS)
    )


def _non_json_explicit_rejection(text: str) -> bool:
    lowered = text.lower()
    if echo_start := _NON_JSON_ECHO_START.search(lowered):
        lowered = lowered[: echo_start.start()]
    if any(token in lowered for token in _NON_JSON_MODEL_REJECTION_TOKENS):
        return False
    if any(token in lowered for token in _FILE_SPECIFIC_TOKENS):
        return False
    return any(pattern.search(lowered) for pattern in _NON_JSON_EXPLICIT_REJECTION_PATTERNS)


def is_explicit_file_input_rejection(exc: Exception) -> bool:
    if not isinstance(exc, ResponsesRequestError) or exc.status not in {200, 400, 422}:
        return False
    try:
        parsed = json.loads(exc.body)
    except (json.JSONDecodeError, TypeError, ValueError):
        return _non_json_explicit_rejection(exc.body)
    if isinstance(parsed, str):
        return _non_json_explicit_rejection(parsed)
    return any(_is_schema_rejection_text(unit) for unit in _json_error_units(parsed))
