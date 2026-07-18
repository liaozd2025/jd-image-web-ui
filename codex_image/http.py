from __future__ import annotations

import os
import socket
import ssl
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Protocol
from urllib import error, request
from urllib.request import HTTPRedirectHandler, HTTPSHandler

DEFAULT_REQUEST_TIMEOUT_SECONDS = 600.0
MAX_PROVIDER_RESPONSE_BYTES = 50 * 1024 * 1024


def _request_timeout_seconds(value: float | None = None) -> float:
    if value is not None:
        return float(value)
    raw = os.getenv("CODEX_IMAGE_REQUEST_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return DEFAULT_REQUEST_TIMEOUT_SECONDS
    try:
        parsed = float(raw)
    except ValueError:
        return DEFAULT_REQUEST_TIMEOUT_SECONDS
    return parsed if parsed > 0 else DEFAULT_REQUEST_TIMEOUT_SECONDS


def _format_elapsed_seconds(seconds: float) -> str:
    return f"{max(0.0, seconds):.2f}".rstrip("0").rstrip(".")


@lru_cache(maxsize=1)
def _https_ssl_context() -> ssl.SSLContext | None:
    if os.getenv("SSL_CERT_FILE") or os.getenv("SSL_CERT_DIR"):
        return ssl.create_default_context()

    try:
        import certifi  # type: ignore[import-not-found]
    except Exception:
        return None

    ca_file = Path(certifi.where())
    if not ca_file.is_file():
        return None
    return ssl.create_default_context(cafile=str(ca_file))


@dataclass
class HTTPResponse:
    status: int
    body: bytes
    headers: dict[str, str]


class Transport(Protocol):
    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes,
    ) -> HTTPResponse: ...


class UrllibTransport:
    def __init__(self, *, timeout: float | None = None) -> None:
        self.timeout = _request_timeout_seconds(timeout)

    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes,
        allow_redirects: bool = True,
    ) -> HTTPResponse:
        req = request.Request(url=url, data=body, headers=headers, method=method)
        started_at = time.monotonic()
        try:
            context = _https_ssl_context() if url.lower().startswith("https://") else None
            handlers = []
            if context is not None:
                handlers.append(HTTPSHandler(context=context))
            if not allow_redirects:
                handlers.append(_NoRedirectHandler())
            opener = request.build_opener(*handlers)
            with opener.open(req, timeout=self.timeout) as response:
                content_length = response.headers.get("Content-Length")
                if content_length:
                    try:
                        declared_length = int(content_length)
                    except ValueError:
                        declared_length = 0
                    if declared_length > MAX_PROVIDER_RESPONSE_BYTES:
                        raise RuntimeError("provider response exceeds the server response limit")
                body_chunks: list[bytes] = []
                total = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_PROVIDER_RESPONSE_BYTES:
                        raise RuntimeError("provider response exceeds the server response limit")
                    body_chunks.append(chunk)
                return HTTPResponse(
                    status=getattr(response, "status", response.getcode()),
                    body=b"".join(body_chunks),
                    headers=dict(response.headers.items()),
                )
        except error.HTTPError as exc:
            body = exc.read(MAX_PROVIDER_RESPONSE_BYTES + 1)
            if len(body) > MAX_PROVIDER_RESPONSE_BYTES:
                body = body[:MAX_PROVIDER_RESPONSE_BYTES]
            return HTTPResponse(
                status=exc.code,
                body=body,
                headers=dict(exc.headers.items()),
            )
        except socket.timeout as exc:
            elapsed = _format_elapsed_seconds(time.monotonic() - started_at)
            raise TimeoutError(f"HTTP request timed out after {elapsed}s (timeout limit {self.timeout:g}s)") from exc
        except error.URLError as exc:
            if isinstance(exc.reason, (socket.timeout, TimeoutError)):
                elapsed = _format_elapsed_seconds(time.monotonic() - started_at)
                raise TimeoutError(
                    f"HTTP request timed out after {elapsed}s (timeout limit {self.timeout:g}s): {exc.reason}"
                ) from exc
            raise


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
