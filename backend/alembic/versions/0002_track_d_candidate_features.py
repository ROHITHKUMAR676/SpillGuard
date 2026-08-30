"""add track d feature payloads

Revision ID: 0002_track_d_candidate_features
Revises: 0001_init_schema
Create Date: 2026-08-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002_track_d_candidate_features"
down_revision: Union[str, None] = "0001_init_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE attribution_candidates ADD COLUMN IF NOT EXISTS raw_features JSONB NOT NULL DEFAULT '{}'")
    op.execute("ALTER TABLE attribution_candidates ADD COLUMN IF NOT EXISTS score_breakdown JSONB NOT NULL DEFAULT '{}'")


def downgrade() -> None:
    op.execute("ALTER TABLE attribution_candidates DROP COLUMN IF EXISTS score_breakdown")
    op.execute("ALTER TABLE attribution_candidates DROP COLUMN IF EXISTS raw_features")
