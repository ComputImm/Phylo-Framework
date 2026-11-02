"""Cheaper updates of the runs table

Revision ID: 017_runs_write_cost
Revises: 016_result_retention
Create Date: 2026-11-02

Every index has to be maintained when a row moves to a new page, and an index on
a column that changes prevents PostgreSQL from updating the row in place at all.

  * Dropped as exact duplicates: ``ix_runs_method_id``, ``ix_runs_status`` and
    ``ix_runs_user_id`` (the ``idx_runs_*`` of the same columns stay).
  * Dropped as covered: ``idx_runs_user_id``, by ``idx_runs_user_created_at``,
    which starts with the same column.
  * Dropped as more expensive than useful: ``idx_runs_worker_lease_until``. The
    lease is renewed throughout a run, and the query that looks for expired
    leases also filters on status, which is indexed.
  * ``fillfactor=70``, so that updates find room in the row's own page. It applies
    to pages written from now on; existing rows are not rewritten.

No data changes. Downgrade restores the indexes and the default fillfactor.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "017_runs_write_cost"
down_revision: Union[str, None] = "016_result_retention"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DROPPED = {
    "ix_runs_method_id": "method_id",
    "ix_runs_status": "status",
    "ix_runs_user_id": "user_id",
    "idx_runs_user_id": "user_id",
    "idx_runs_worker_lease_until": "worker_lease_until",
}


def upgrade() -> None:
    for name in _DROPPED:
        op.execute(f"DROP INDEX IF EXISTS {name}")
    op.execute("ALTER TABLE runs SET (fillfactor = 70)")


def downgrade() -> None:
    op.execute("ALTER TABLE runs RESET (fillfactor)")
    for name, column in _DROPPED.items():
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON runs ({column})")
