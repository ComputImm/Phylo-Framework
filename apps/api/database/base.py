from __future__ import annotations

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool

from apps.api.config import (
    DATABASE_URL,
    DB_MAX_OVERFLOW,
    DB_POOL_RECYCLE,
    DB_POOL_SIZE,
    DB_POOL_TIMEOUT,
)


def pool_options() -> dict:
    """How the engine holds its connections.

    A new PostgreSQL connection is a new server process plus a password
    exchange, far more work than the short queries sent over it, so connections
    are kept and reused. pool_pre_ping replaces one that died while it was idle
    (a database restart, say), so that this does not reach the caller.

    A pooled connection belongs to the event loop that opened it: code that runs
    several event loops in one process (the tests) sets DB_POOL_SIZE=0.
    """
    if DB_POOL_SIZE == 0:
        return {"poolclass": NullPool}
    return {
        "pool_size": DB_POOL_SIZE,
        "max_overflow": DB_MAX_OVERFLOW,
        "pool_timeout": DB_POOL_TIMEOUT,
        "pool_recycle": DB_POOL_RECYCLE,
        "pool_pre_ping": True,
    }


# Create async engine.
# server_settings timezone=UTC forces PostgreSQL to use UTC so that timestamptz
# values are returned with a safe timezone name. On Windows, other timezone names
# (e.g. numeric like <+00>-00) can cause OSError [Errno 22] Invalid argument
# when Python's zoneinfo/datetime code tries to resolve the timezone.
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    **pool_options(),
    connect_args={"server_settings": {"timezone": "UTC"}},
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for all models
Base = declarative_base()


# get_session is now in __init__.py as FastAPI dependency


async def init_db() -> None:
    """Initialize database - create all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close database connections."""
    await engine.dispose()
