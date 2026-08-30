"""persist candidate LLM explanations

Revision ID: 0006_candidate_llm_explanation
Revises: 0005_synthetic_ingestion_batches
Create Date: 2026-08-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006_candidate_llm_explanation"
down_revision: Union[str, None] = "0005_synthetic_ingestion_batches"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE attribution_candidates ADD COLUMN IF NOT EXISTS llm_explanation TEXT")
    op.execute("ALTER TABLE attribution_candidates ADD COLUMN IF NOT EXISTS llm_explained_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE attribution_candidates DROP COLUMN IF EXISTS llm_explained_at")
    op.execute("ALTER TABLE attribution_candidates DROP COLUMN IF EXISTS llm_explanation")
