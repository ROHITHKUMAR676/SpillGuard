"""add detection characterization contract fields

Revision ID: 0003_detect_contract
Revises: 0002_track_d_candidate_features
Create Date: 2026-08-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003_detect_contract"
down_revision: Union[str, None] = "0002_track_d_candidate_features"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS event_id TEXT")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS processing_timestamp TIMESTAMPTZ")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS source TEXT")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS crs TEXT")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS bbox JSONB")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS v4_threshold DOUBLE PRECISION")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS v3_threshold DOUBLE PRECISION")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS candidate_count INT")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS accepted_candidates INT")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS source_width INT")
    op.execute("ALTER TABLE oil_slicks ADD COLUMN IF NOT EXISTS source_height INT")


def downgrade() -> None:
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS source_height")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS source_width")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS accepted_candidates")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS candidate_count")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS v3_threshold")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS v4_threshold")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS bbox")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS crs")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS source")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS processing_timestamp")
    op.execute("ALTER TABLE oil_slicks DROP COLUMN IF EXISTS event_id")
