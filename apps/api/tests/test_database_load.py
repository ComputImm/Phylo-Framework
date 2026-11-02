"""What keeps the application's load on PostgreSQL small: reused connections, no
connection held during slow work, no writes that change nothing, and no large
result documents loaded by queries that do not read them."""
from __future__ import annotations

import asyncio
import re
from uuid import UUID

import asyncpg
import pytest
from sqlalchemy import event, exc as sa_exc, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from apps.api import config
from apps.api.auth import routers as auth_routers
from apps.api.database import base
from apps.api.database.errors import database_unavailable
from apps.api.database.models import Run, RunStatus
from apps.api.repositories.artifact_repository import ArtifactRepository
from apps.api.repositories.run_repository import RunRepository
from apps.api.repositories.user_repository import UserRepository
from apps.api.routers import artifacts
from apps.api.services.method_jobs_client import JobStatus
from apps.api.workers import run_worker as worker

FASTA = b">root\nACGT\n>leaf\nACGA\n"


# --------------------------------------------------------------------------- #
# The pool
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("value,expected", [("7", 7), ("0", 0), ("-1", 5), ("many", 5), ("", 5)])
def test_a_wrong_pool_setting_falls_back_to_the_default(monkeypatch, value, expected):
    monkeypatch.setenv("DB_POOL_SIZE", value)
    assert config._pool_setting("DB_POOL_SIZE", 5) == expected


def test_a_pool_size_of_zero_turns_pooling_off(monkeypatch):
    monkeypatch.setattr(base, "DB_POOL_SIZE", 0)
    assert base.pool_options() == {"poolclass": NullPool}


async def _backend_pid(engine) -> int:
    async with engine.connect() as connection:
        return await connection.scalar(text("SELECT pg_backend_pid()"))


async def test_connections_are_reused_and_a_dead_one_is_replaced_unnoticed(session, monkeypatch):
    monkeypatch.setattr(base, "DB_POOL_SIZE", 2)
    engine = create_async_engine(session.bind.url, **base.pool_options())
    try:
        first = await _backend_pid(engine)
        assert await _backend_pid(engine) == first

        # As after a database restart: the pooled connection is gone.
        await session.execute(text("SELECT pg_terminate_backend(:pid)"), {"pid": first})
        await session.commit()
        await asyncio.sleep(0.1)

        replacement = await _backend_pid(engine)
        assert replacement != first
    finally:
        await engine.dispose()


async def test_an_exhausted_pool_counts_as_the_database_being_unavailable(session):
    engine = create_async_engine(session.bind.url, pool_size=1, max_overflow=0, pool_timeout=0.1)
    try:
        async with engine.connect():
            with pytest.raises(sa_exc.TimeoutError) as caught:
                async with engine.connect():
                    pass
        assert database_unavailable(caught.value)
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# No connection is held during slow work
# --------------------------------------------------------------------------- #
def watch_downloads(session, monkeypatch) -> list[bool]:
    """Records, for every chunk read from storage, whether a transaction is open."""
    store = artifacts.storage()
    original = store.stream_download
    seen: list[bool] = []

    async def watched(*args, **kwargs):
        async for chunk in original(*args, **kwargs):
            seen.append(session.in_transaction())
            yield chunk

    monkeypatch.setattr(store, "stream_download", watched)
    return seen


async def upload_dataset(client, content=FASTA) -> str:
    init = (await client.post("/uploads/init", json={"original_filename": "sample.fasta"})).json()
    response = await client.put(init["content_url"], content=content)
    assert response.status_code == 200, response.text
    return response.json()["file_id"]


async def test_receiving_an_upload_holds_no_connection(client, account, session):
    seen: list[bool] = []

    async def body():
        yield FASTA[:6]
        seen.append(session.in_transaction())
        yield FASTA[6:]

    await upload_dataset(client, content=body())
    assert seen == [False]


async def test_a_refused_upload_is_still_recorded(client, account, session, monkeypatch):
    # The session is used again after it let go of its connection.
    monkeypatch.setattr("apps.api.routers.uploads.STORAGE_QUOTA_PER_USER_BYTES", 1)
    init = (await client.post("/uploads/init", json={"original_filename": "sample.fasta"})).json()
    response = await client.put(init["content_url"], content=FASTA)
    assert response.status_code == 413
    row = await session.execute(text("SELECT status FROM upload_sessions WHERE id = :id"), {"id": init["upload_id"]})
    assert row.scalar().upper() == "ERROR"


async def test_sending_a_dataset_holds_no_connection(client, account, session, monkeypatch):
    file_id = await upload_dataset(client)
    seen = watch_downloads(session, monkeypatch)
    response = await client.get(f"/datasets/{file_id}/download")
    assert response.status_code == 200 and response.content == FASTA
    assert seen and not any(seen)


async def test_peeking_into_a_dataset_holds_no_connection(client, account, session, monkeypatch):
    file_id = await upload_dataset(client)
    seen = watch_downloads(session, monkeypatch)
    response = await client.get(f"/datasets/{file_id}/fasta-id-style")
    assert response.status_code == 200
    assert seen and not any(seen)


@pytest.mark.parametrize("suffix", ["download", "preview"])
async def test_sending_an_artifact_holds_no_connection(client, account, session, monkeypatch, suffix):
    run = await RunRepository(session).create_run(
        method_id="gctree", params={}, user_id=UUID(account["user"]["id"])
    )
    await artifacts.storage().upload(b"a log", "runs/any/job.log")
    rows = await ArtifactRepository(session).replace_for_run(run.id, [{
        "object_key": "runs/any/job.log", "filename": "job.log", "storage_backend": "local",
        "size_bytes": 5, "artifact_kind": "log", "is_previewable": True,
    }])
    await session.commit()
    seen = watch_downloads(session, monkeypatch)
    response = await client.get(f"/artifacts/{rows[0].id}/{suffix}")
    assert response.status_code == 200 and response.content == b"a log"
    assert seen and not any(seen)


def watch_emails(session, monkeypatch) -> list[bool]:
    seen: list[bool] = []

    async def send(*args, **kwargs):
        seen.append(session.in_transaction())
        return True

    monkeypatch.setattr(auth_routers, "send_email", send)
    return seen


async def test_sending_account_emails_holds_no_connection(client, account, session, monkeypatch):
    seen = watch_emails(session, monkeypatch)
    monkeypatch.setenv("EMAIL_VERIFICATION", "required")
    fresh = {"email": "new@example.org", "username": "new", "password": "test-password-123"}
    registered = {"email": "owner@example.org", "username": "owner2", "password": "test-password-123"}

    assert (await client.post("/auth/register", json=fresh)).status_code == 202              # a new account
    assert (await client.post("/auth/register", json=registered)).status_code == 202         # same person, unconfirmed
    await UserRepository(session).mark_email_verified(UUID(account["user"]["id"]))
    assert (await client.post("/auth/register", json=registered)).status_code == 202         # already confirmed
    await client.post("/auth/forgot-password", json={"email": "owner@example.org"})

    assert seen == [False, False, False, False]


# --------------------------------------------------------------------------- #
# No writes that change nothing
# --------------------------------------------------------------------------- #
async def row_version(session, run_id) -> str:
    """Changes with every write to the row, and only then."""
    version = await session.scalar(text("SELECT xmin::text FROM runs WHERE id = :id"), {"id": run_id})
    await session.commit()
    return version


@pytest.fixture
async def active_run(session, account):
    repo = RunRepository(session)
    user_id = UUID(account["user"]["id"])
    run = await repo.create_run(method_id="gctree", params={}, user_id=user_id)
    await repo.promote_next_for_user(user_id)
    await repo.claim_next_run("w", 60)
    return run.id


async def test_reporting_the_same_stage_again_does_not_touch_the_row(session, active_run):
    repo = RunRepository(session)
    changed = await repo.update_stage(active_run, "RUNNING_METHOD", message="Running", progress=45)
    assert changed.stage == "RUNNING_METHOD" and changed.progress == 45
    before = await row_version(session, active_run)

    assert await repo.update_stage(active_run, "RUNNING_METHOD", message="Running", progress=45) is None
    assert await repo.update_stage(active_run, "RUNNING_METHOD", progress=30) is None      # never goes back
    assert await row_version(session, active_run) == before


@pytest.mark.parametrize("change", [
    {"stage": "FETCHING_RESULT"},
    {"stage": "RUNNING_METHOD", "message": "Almost there"},
    {"stage": "RUNNING_METHOD", "progress": 46},
])
async def test_any_real_change_of_stage_is_written(session, active_run, change):
    repo = RunRepository(session)
    await repo.update_stage(active_run, "RUNNING_METHOD", message="Running", progress=45)
    before = await row_version(session, active_run)
    assert await repo.update_stage(active_run, **change) is not None
    assert await row_version(session, active_run) != before


async def test_following_an_unchanged_job_does_not_write_to_the_run(session, active_run, monkeypatch):
    monkeypatch.setattr(worker, "AsyncSessionLocal", async_sessionmaker(session.bind, expire_on_commit=False))
    monkeypatch.setattr(worker, "METHOD_POLL_INTERVAL", 0)
    await RunRepository(session).update(active_run, method_job_id="job-1")
    running = JobStatus(True, "job-1", "RUNNING", stage="RUNNING_METHOD", progress=45, message="Running")
    answers = iter([running, running, running, running, JobStatus(True, "job-1", "CANCELLED")])
    versions: list[str] = []

    async def status(*args, **kwargs):
        versions.append(await row_version(session, active_run))
        return next(answers)

    monkeypatch.setattr(worker.jobs, "get_job_status", status)
    await worker._poll_method_job(active_run, "gctree", "job-1", "w")

    # The first look records the stage; the three after it find nothing to store.
    assert versions[0] != versions[1]
    assert versions[1] == versions[2] == versions[3] == versions[4]


async def test_a_missed_lease_renewal_is_retried_soon(session, active_run, monkeypatch):
    monkeypatch.setattr(worker, "LEASE_SECONDS", 3)                         # renewal every second
    monkeypatch.setattr(worker, "DATABASE_RETRY_SECONDS", 0.01)
    real = async_sessionmaker(session.bind, expire_on_commit=False)
    renewed = asyncio.Event()
    attempts = 0

    def sessions():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise asyncpg.exceptions.ConnectionDoesNotExistError("connection was closed")
        renewed.set()
        return real()

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    keeper = asyncio.create_task(worker._keep_lease(active_run, "w"))
    try:
        # One interval until the attempt that fails. Waiting for a second
        # interval after it would take longer than this allows.
        await asyncio.wait_for(renewed.wait(), timeout=1.5)
    finally:
        keeper.cancel()


# --------------------------------------------------------------------------- #
# The runs table
# --------------------------------------------------------------------------- #
DROPPED = {"ix_runs_method_id", "ix_runs_status", "ix_runs_user_id", "idx_runs_user_id", "idx_runs_worker_lease_until"}


async def test_runs_has_no_redundant_indexes_and_leaves_room_for_updates(session):
    rows = await session.execute(text("SELECT indexname FROM pg_indexes WHERE tablename = 'runs'"))
    indexes = {row[0] for row in rows}
    assert not indexes & DROPPED
    assert {"idx_runs_status", "idx_runs_method_id", "idx_runs_user_created_at", "idx_runs_status_dispatch_seq",
            "uq_runs_user_active_turn"} <= indexes
    options = await session.scalar(text("SELECT reloptions FROM pg_class WHERE relname = 'runs'"))
    assert options == ["fillfactor=70"]


def test_the_model_declares_what_the_migration_left():
    assert not {index.name for index in Run.__table__.indexes} & DROPPED


async def test_the_lease_query_finds_expired_runs_without_the_lease_index(session, active_run):
    await RunRepository(session).update(active_run, worker_lease_until=text("now() - interval '1 minute'"))
    reclaimed = await RunRepository(session).claim_next_run("replacement", 60)
    assert reclaimed.id == active_run and reclaimed.worker_id == "replacement"


# --------------------------------------------------------------------------- #
# Result documents are only loaded where they are read
# --------------------------------------------------------------------------- #
async def test_only_the_result_route_loads_the_result(client, account, session):
    repo = RunRepository(session)
    user_id = UUID(account["user"]["id"])
    file_id = UUID(await upload_dataset(client))
    finished = []
    for _ in range(2):
        run = await repo.create_run(method_id="gctree", params={}, user_id=user_id)
        await repo.update(run.id, status=RunStatus.DONE, result={"ok": True, "marker": "stored"}, input_file_id=file_id)
        finished.append(run.id)
    await repo.create_run(method_id="gctree", params={}, user_id=user_id)        # the active turn
    await repo.create_run(method_id="gctree", params={}, user_id=user_id)        # waiting behind it
    await session.commit()
    # Forget everything already loaded: a route that reads `result` now fails.
    session.expunge_all()

    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(session.bind.sync_engine, "before_cursor_execute", record)
    try:
        for path in ("/runs", "/runs/dashboard", f"/runs/{finished[0]}/status", f"/runs/{finished[0]}/same-dataset"):
            response = await client.get(path)
            assert response.status_code == 200, f"{path}: {response.text}"
            if path.endswith("same-dataset"):
                assert [r["id"] for r in response.json()] == [str(finished[1])]
        # Not runs.results_expired_at, which every one of them needs.
        assert statements and not any(re.search(r"runs\.result\b", s) for s in statements)
    finally:
        event.remove(session.bind.sync_engine, "before_cursor_execute", record)

    session.expunge_all()
    result = await client.get(f"/runs/{finished[0]}/result")
    assert result.status_code == 200 and result.json()["marker"] == "stored"
