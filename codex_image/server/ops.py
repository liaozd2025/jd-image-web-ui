from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import ServerSettings
from .database import PostgresConnections
from .identity import BootstrapAlreadyInitialized, IdentityRepository
from .migrations import MigrationRunner
from .audit import record_audit_event
from .maintenance import (
    MaintenanceLockError,
    acquire_lock,
    create_backup,
    purge_expired_trash,
    reconcile_storage,
    release_lock,
    restore_backup,
)
from .security import CredentialValidationError, hash_password, new_temporary_password


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Operate a jd-image-web-ui server deployment")
    commands = parser.add_subparsers(dest="command", required=True)
    bootstrap = commands.add_parser(
        "bootstrap-admin",
        help="create the first administrator and print a one-time temporary password",
    )
    bootstrap.add_argument("--username", required=True)
    backup = commands.add_parser("backup", help="create a PostgreSQL and file-volume backup")
    backup.add_argument("--output", required=True, type=Path)
    restore = commands.add_parser("restore", help="restore a backup into this server deployment")
    restore.add_argument("--backup", required=True, type=Path)
    restore.add_argument("--confirm", action="store_true")
    reconcile = commands.add_parser("reconcile-storage", help="report missing and orphaned files")
    reconcile.add_argument("--json", action="store_true", dest="as_json")
    purge = commands.add_parser("purge-trash", help="physically purge expired trash after confirmation")
    purge.add_argument("--confirm", action="store_true")
    lock = commands.add_parser("maintenance-lock", help="acquire or release the maintenance lock")
    lock_subcommands = lock.add_subparsers(dest="lock_command", required=True)
    lock_subcommands.add_parser("acquire")
    release_parser = lock_subcommands.add_parser("release")
    release_parser.add_argument("--token", required=True)
    force_release_parser = lock_subcommands.add_parser("force-release")
    force_release_parser.add_argument("--confirm", action="store_true")
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

    try:
        if args.command == "maintenance-lock":
            if args.lock_command == "acquire":
                lock = acquire_lock(connections, purpose="manual maintenance")
                print(json.dumps({"token": lock.token, "purpose": lock.purpose}))
            elif args.lock_command == "force-release":
                if not args.confirm:
                    print("Refusing to force-release without --confirm", file=sys.stderr)
                    return 2
                from .maintenance import force_release_lock

                force_release_lock(connections)
                print("Maintenance lock force-released")
            else:
                release_lock(connections, args.token)
                print("Maintenance lock released")
            return 0
        if args.command == "reconcile-storage":
            report = reconcile_storage(connections, data_root=settings.data_root)
            print(json.dumps(report, ensure_ascii=False, indent=2) if args.as_json else _format_report(report))
            return 0
        if args.command == "purge-trash":
            if not args.confirm:
                print("Refusing to purge without --confirm", file=sys.stderr)
                return 2
            lock = acquire_lock(connections, purpose="purge expired trash")
            try:
                report = purge_expired_trash(connections, data_root=settings.data_root)
            finally:
                release_lock(connections, lock.token)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0
        if args.command == "backup":
            lock = acquire_lock(connections, purpose="create backup")
            try:
                report = create_backup(connections, data_root=settings.data_root, output_root=args.output)
                with connections.connect() as connection:
                    with connection.cursor() as cursor:
                        record_audit_event(
                            cursor,
                            action="maintenance.backup_created",
                            actor_user_id=None,
                            subject_user_id=None,
                            details={"output": str(args.output), "files": len(report["files"])},
                        )
            finally:
                release_lock(connections, lock.token)
            print(json.dumps({"output": str(args.output), "files": len(report["files"])}, ensure_ascii=False))
            return 0
        if args.command == "restore":
            if not args.confirm:
                print("Refusing to restore without --confirm", file=sys.stderr)
                return 2
            lock = acquire_lock(connections, purpose="restore backup")
            try:
                report = restore_backup(
                    connections,
                    backup_root=args.backup,
                    data_root=settings.data_root,
                    maintenance_token=lock.token,
                )
                with connections.connect() as connection:
                    with connection.cursor() as cursor:
                        record_audit_event(
                            cursor,
                            action="maintenance.backup_restored",
                            actor_user_id=None,
                            subject_user_id=None,
                            details={"backup": str(args.backup), "files": report["files"]},
                        )
            finally:
                release_lock(connections, lock.token)
            print(json.dumps(report, ensure_ascii=False))
            return 0
    except MaintenanceLockError as error:
        print(str(error), file=sys.stderr)
        return 1

    return 2


def _format_report(report: dict[str, object]) -> str:
    missing = report.get("missing", [])
    orphaned = report.get("orphaned", [])
    expired = report.get("expired", {})
    return f"missing={len(missing)} orphaned={len(orphaned)} expired={expired}"


def main_entry() -> None:
    raise SystemExit(main())


if __name__ == "__main__":
    main_entry()
