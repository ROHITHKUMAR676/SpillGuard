"""synthetic ingestion batch status

Revision ID: 0005_synthetic_ingestion_batches
Revises: 0004_drift_bearing
Create Date: 2026-08-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005_synthetic_ingestion_batches"
down_revision: Union[str, None] = "0004_drift_bearing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS synthetic_ingestion_batches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          status TEXT NOT NULL CHECK (status IN ('running','succeeded','partial_failed','failed')) DEFAULT 'running',
          case_count INT NOT NULL DEFAULT 5,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          completed_at TIMESTAMPTZ,
          error TEXT
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS synthetic_ingestion_stage_status (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          batch_id UUID NOT NULL REFERENCES synthetic_ingestion_batches(id) ON DELETE CASCADE,
          case_id UUID REFERENCES cases(id),
          stage TEXT NOT NULL CHECK (stage IN ('case','sar','detection','drift','ais_attribution','ranking_evidence','llm_explanation')),
          status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed')) DEFAULT 'queued',
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          error TEXT
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_synth_batches_started ON synthetic_ingestion_batches (started_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_synth_stage_batch ON synthetic_ingestion_stage_status (batch_id, case_id, stage)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS synthetic_ingestion_stage_status")
    op.execute("DROP TABLE IF EXISTS synthetic_ingestion_batches")
