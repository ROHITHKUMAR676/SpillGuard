"""add drift corridor bearing

Revision ID: 0004_drift_bearing
Revises: 0003_detect_contract
Create Date: 2026-08-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004_drift_bearing"
down_revision: Union[str, None] = "0003_detect_contract"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE source_hypotheses ADD COLUMN IF NOT EXISTS drift_corridor_bearing_deg DOUBLE PRECISION")


def downgrade() -> None:
    op.execute("ALTER TABLE source_hypotheses DROP COLUMN IF EXISTS drift_corridor_bearing_deg")
