from __future__ import annotations

from contextlib import contextmanager
from functools import lru_cache
from queue import Empty, LifoQueue
from threading import Lock
from typing import Any, Iterator

import psycopg
from supabase import Client, create_client

from app.config import get_settings

try:
    from psycopg_pool import ConnectionPool as PsycopgConnectionPool
except ImportError:  # pragma: no cover - depends on the installed psycopg extras.
    PsycopgConnectionPool = None  # type: ignore[assignment]


class SimplePsycopgPool:
    """Small lazy sync pool used when psycopg_pool is not installed."""

    def __init__(self, conninfo: str, *, min_size: int = 0, max_size: int = 4) -> None:
        self.conninfo = conninfo
        self.min_size = min_size
        self.max_size = max_size
        self._available: LifoQueue[psycopg.Connection[Any]] = LifoQueue(maxsize=max_size)
        self._lock = Lock()
        self._opened = 0
        self.closed = False

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection[Any]]:
        if self.closed:
            raise RuntimeError("Postgres pool is closed")

        conn = self._get_connection()
        try:
            yield conn
        finally:
            self._put_connection(conn)

    def close(self) -> None:
        self.closed = True
        while True:
            try:
                conn = self._available.get_nowait()
            except Empty:
                return
            conn.close()

    def _get_connection(self) -> psycopg.Connection[Any]:
        try:
            return self._available.get_nowait()
        except Empty:
            with self._lock:
                if self._opened < self.max_size:
                    self._opened += 1
                    return psycopg.connect(self.conninfo, autocommit=True)

            return self._available.get()

    def _put_connection(self, conn: psycopg.Connection[Any]) -> None:
        if self.closed or conn.closed:
            conn.close()
            return

        self._available.put(conn)


PgPool = Any
_pg_pool: PgPool | None = None
_pg_pool_lock = Lock()


@lru_cache
def get_service_client() -> Client:
    settings = get_settings()
    return create_client(str(settings.supabase_url), settings.supabase_service_role_key)


def get_db() -> Client:
    return get_service_client()


def get_pg_pool() -> PgPool:
    global _pg_pool

    if _pg_pool is not None:
        return _pg_pool

    with _pg_pool_lock:
        if _pg_pool is not None:
            return _pg_pool

        settings = get_settings()
        if PsycopgConnectionPool is not None:
            _pg_pool = PsycopgConnectionPool(
                conninfo=settings.database_url,
                min_size=0,
                max_size=4,
                open=False,
                kwargs={"autocommit": True},
            )
        else:
            _pg_pool = SimplePsycopgPool(settings.database_url, min_size=0, max_size=4)

        return _pg_pool
