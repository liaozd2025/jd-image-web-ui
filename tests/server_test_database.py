from __future__ import annotations

from contextlib import contextmanager
from collections.abc import Iterator
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import psycopg
from psycopg import sql


@contextmanager
def temporary_postgres_database(base_url: str) -> Iterator[str]:
    parsed = urlsplit(base_url)
    database_name = f"jd_image_test_{uuid4().hex}"
    admin_url = urlunsplit(parsed._replace(path="/postgres"))
    database_url = urlunsplit(parsed._replace(path=f"/{database_name}"))

    with psycopg.connect(admin_url, autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
    try:
        yield database_url
    finally:
        with psycopg.connect(admin_url, autocommit=True) as connection:
            connection.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s",
                (database_name,),
            )
            connection.execute(sql.SQL("DROP DATABASE {}").format(sql.Identifier(database_name)))
