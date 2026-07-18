"""Compatibility entry point for server operations only.

User image generation is exposed through the authenticated browser application;
this module deliberately delegates only to the server operations CLI.
"""

from __future__ import annotations

from collections.abc import Sequence

from .server.ops import main as _operations_main


def main(argv: Sequence[str] | None = None) -> int:
    return _operations_main(list(argv) if argv is not None else None)


def main_entry() -> None:
    raise SystemExit(main())
