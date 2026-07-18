from __future__ import annotations

import argparse
import sys

from .config import ServerSettings
from .database import PostgresConnections
from .identity import BootstrapAlreadyInitialized, IdentityRepository
from .migrations import MigrationRunner
from .security import CredentialValidationError, hash_password, new_temporary_password


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Operate a jd-image-web-ui server deployment")
    commands = parser.add_subparsers(dest="command", required=True)
    bootstrap = commands.add_parser(
        "bootstrap-admin",
        help="create the first administrator and print a one-time temporary password",
    )
    bootstrap.add_argument("--username", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        settings = ServerSettings.from_env()
    except (TypeError, ValueError) as error:
        print(f"Configuration error: {error}", file=sys.stderr)
        return 2

    connections = PostgresConnections(
        settings.database_url,
        connect_timeout_seconds=settings.database_connect_timeout_seconds,
    )
    if not MigrationRunner(connections).try_apply():
        print("Database initialization failed", file=sys.stderr)
        return 2

    if args.command == "bootstrap-admin":
        temporary_password = new_temporary_password()
        try:
            user = IdentityRepository(connections).bootstrap_admin(
                args.username,
                hash_password(temporary_password),
            )
        except (BootstrapAlreadyInitialized, CredentialValidationError) as error:
            print(str(error), file=sys.stderr)
            return 1
        print("Initial administrator created")
        print(f"Username: {user.username}")
        print(f"Temporary password: {temporary_password}")
        print("This password is shown once and must be changed at first login.")
        return 0

    return 2


def main_entry() -> None:
    raise SystemExit(main())


if __name__ == "__main__":
    main_entry()
