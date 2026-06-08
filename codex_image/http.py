from __future__ import annotations

import os
import socket
from dataclasses import dataclass
from typing import Protocol
from urllib import error, request

DEFAULT_REQUEST_TIMEOUT_SECONDS = 600.0


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
    ) -> HTTPResponse:
        req = request.Request(url=url, data=body, headers=headers, method=method)
        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                return HTTPResponse(
                    status=getattr(response, "status", response.getcode()),
                    body=response.read(),
                    headers=dict(response.headers.items()),
                )
        except error.HTTPError as exc:
            return HTTPResponse(
                status=exc.code,
                body=exc.read(),
                headers=dict(exc.headers.items()),
            )
        except socket.timeout as exc:
            raise TimeoutError(f"HTTP request timed out after {self.timeout:g}s") from exc
        except error.URLError as exc:
            if isinstance(exc.reason, (socket.timeout, TimeoutError)):
                raise TimeoutError(f"HTTP request timed out after {self.timeout:g}s: {exc.reason}") from exc
            raise
