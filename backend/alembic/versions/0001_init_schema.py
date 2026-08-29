"""init schema

Revision ID: 0001_init_schema
Revises:
Create Date: 2026-08-29
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001_init_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DDL = """
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('analyst','viewer','admin')) DEFAULT 'analyst',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','reviewed','closed')) DEFAULT 'open',
  aoi GEOMETRY(POLYGON, 4326) NOT NULL,
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);
CREATE INDEX idx_cases_aoi ON cases USING GIST (aoi);
CREATE INDEX idx_cases_status ON cases (status);

CREATE TABLE satellite_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id),
  sensor TEXT NOT NULL,
  acquisition_time TIMESTAMPTZ NOT NULL,
  footprint GEOMETRY(POLYGON, 4326) NOT NULL,
  polarization TEXT[],
  local_object_key TEXT,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_scenes_footprint ON satellite_scenes USING GIST (footprint);
CREATE INDEX idx_scenes_time ON satellite_scenes (acquisition_time);

CREATE TABLE oil_slicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES satellite_scenes(id),
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  area_km2 DOUBLE PRECISION,
  perimeter_km DOUBLE PRECISION,
  centroid GEOMETRY(POINT, 4326),
  orientation_deg DOUBLE PRECISION,
  confidence DOUBLE PRECISION CHECK (confidence BETWEEN 0 AND 1),
  possible_lookalike BOOLEAN NOT NULL DEFAULT FALSE,
  lookalike_reason TEXT,
  estimated_age_min_h DOUBLE PRECISION,
  estimated_age_max_h DOUBLE PRECISION,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slicks_geom ON oil_slicks USING GIST (geometry);
CREATE INDEX idx_slicks_scene ON oil_slicks (scene_id);

CREATE TABLE environmental_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('copernicus_marine','era5')),
  variable TEXT NOT NULL,
  valid_time TIMESTAMPTZ NOT NULL,
  bbox GEOMETRY(POLYGON, 4326) NOT NULL,
  object_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_envfields_bbox ON environmental_fields USING GIST (bbox);
CREATE INDEX idx_envfields_time ON environmental_fields (valid_time);

CREATE TABLE drift_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slick_id UUID NOT NULL REFERENCES oil_slicks(id),
  direction TEXT NOT NULL CHECK (direction IN ('backward','forward')),
  engine TEXT NOT NULL CHECK (engine IN ('lightweight_particle','pygnome')) DEFAULT 'lightweight_particle',
  ensemble_size INT NOT NULL,
  environment_field_ids UUID[],
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  result_object_key TEXT
);

CREATE TABLE source_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drift_run_id UUID NOT NULL REFERENCES drift_runs(id),
  probability_surface_object_key TEXT NOT NULL,
  probable_source_region GEOMETRY(POLYGON, 4326) NOT NULL,
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sourcehyp_region ON source_hypotheses USING GIST (probable_source_region);

CREATE TABLE forward_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drift_run_id UUID NOT NULL REFERENCES drift_runs(id),
  horizon_hours INT NOT NULL,
  percentile INT NOT NULL,
  envelope GEOMETRY(POLYGON, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_forecast_envelope ON forward_forecasts USING GIST (envelope);

CREATE TABLE vessels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmsi TEXT,
  imo TEXT,
  name TEXT,
  flag TEXT,
  vessel_type TEXT,
  source_registry TEXT DEFAULT 'synthetic'
);
CREATE UNIQUE INDEX idx_vessels_mmsi ON vessels (mmsi) WHERE mmsi IS NOT NULL;

CREATE TABLE vessel_positions (
  id BIGSERIAL PRIMARY KEY,
  vessel_id UUID NOT NULL REFERENCES vessels(id),
  ts TIMESTAMPTZ NOT NULL,
  position GEOMETRY(POINT, 4326) NOT NULL,
  sog_knots DOUBLE PRECISION,
  cog_deg DOUBLE PRECISION,
  heading_deg DOUBLE PRECISION,
  nav_status TEXT,
  source TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE INDEX idx_positions_vessel_time ON vessel_positions (vessel_id, ts);
CREATE INDEX idx_positions_geom ON vessel_positions USING GIST (position);

CREATE TABLE vessel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id UUID NOT NULL REFERENCES vessels(id),
  event_type TEXT NOT NULL CHECK (event_type IN
    ('AIS_GAP','UNUSUAL_STOP','COURSE_DEVIATION','LOITERING',
     'SOURCE_REGION_ENTRY','SOURCE_REGION_EXIT','SPEED_ANOMALY')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  geometry GEOMETRY(GEOMETRY, 4326),
  confidence DOUBLE PRECISION
);
CREATE INDEX idx_events_vessel ON vessel_events (vessel_id, start_time);

CREATE TABLE attribution_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  vessel_id UUID NOT NULL REFERENCES vessels(id),
  overall_score DOUBLE PRECISION NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  spatial_score DOUBLE PRECISION NOT NULL,
  temporal_score DOUBLE PRECISION NOT NULL,
  trajectory_score DOUBLE PRECISION NOT NULL,
  source_probability_score DOUBLE PRECISION NOT NULL,
  behaviour_score DOUBLE PRECISION NOT NULL,
  ais_continuity_score DOUBLE PRECISION NOT NULL,
  supporting_evidence TEXT[] NOT NULL DEFAULT '{}',
  contradicting_evidence TEXT[] NOT NULL DEFAULT '{}',
  model_version TEXT NOT NULL DEFAULT 'attribution-v1-deterministic',
  rank INT NOT NULL,
  excluded_by_analyst BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidates_case_rank ON attribution_candidates (case_id, rank);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id),
  job_type TEXT NOT NULL CHECK (job_type IN ('detect','drift','vessel_analysis','report')),
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed')) DEFAULT 'queued',
  progress DOUBLE PRECISION DEFAULT 0,
  result_ref UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE analyst_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN
    ('accept_detection','reject_detection','edit_polygon','exclude_candidate','note','close_case','reopen_case')),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_case ON analyst_reviews (case_id, created_at);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  object_key TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf','json')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  version_tag TEXT NOT NULL,
  mlflow_run_id TEXT,
  trained_at TIMESTAMPTZ,
  metrics JSONB
);
"""


def upgrade() -> None:
    op.execute(DDL)


def downgrade() -> None:
    for table in [
        "model_versions",
        "reports",
        "analyst_reviews",
        "jobs",
        "attribution_candidates",
        "vessel_events",
        "vessel_positions",
        "vessels",
        "forward_forecasts",
        "source_hypotheses",
        "drift_runs",
        "environmental_fields",
        "oil_slicks",
        "satellite_scenes",
        "cases",
        "users",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
