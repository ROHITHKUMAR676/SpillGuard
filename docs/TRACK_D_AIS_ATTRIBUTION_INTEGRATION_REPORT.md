# Track D AIS Attribution Integration Report

Date: 2026-08-30

## Scope

This report separates the attached migration instructions from the current user request. The migration brief describes the target architecture. The current request is for a status report covering completed work, pending work, integration strategy, correctness of the AIS attribution implementation, and the two future model placeholders.

## Work Completed

The AIS attribution notebook/reference file has not been copied as-is. Its responsibilities were distributed into the existing backend structure.

Implemented components:

- `backend/modules/ais/synthetic.py`
  - Loads the provided synthetic AIS CSV dataset.
  - Normalizes AIS records into an internal `AISObservation` dataclass.
  - Preserves MMSI, IMO, vessel metadata, timestamp, latitude, longitude, SOG, COG, heading, nav status, and `source="synthetic"`.
  - Validates empty datasets, non-synthetic source values, and invalid coordinates.

- `backend/modules/attribution/filter.py`
  - Implements candidate filtering using source-region polygon, time window, spatial buffer, and temporal buffer.
  - Keeps filtering separate from AIS loading and scoring.

- `backend/modules/attribution/features.py`
  - Implements Track D raw feature extraction:
    - spatial proximity
    - time inside source region
    - temporal overlap
    - vessel bearing
    - speed anomaly
    - loitering duration
    - AIS gap count
    - AIS gap presence
    - source-region entry/exit event detection

- `backend/modules/attribution/scorer.py`
  - Implements deterministic scoring.
  - Preserves the six attribution dimensions:
    - spatial
    - temporal
    - trajectory
    - source_probability
    - behavioural
    - ais_continuity
  - Keeps score bounded from `0` to `100`.
  - Uses deterministic ranking with MMSI tie-breaks.
  - Does not use Gemini or any LLM for score/rank calculation.

- `backend/workers/drift_worker.py`
  - Replaced the hardcoded vessel-analysis stub.
  - `run_vessel_analysis` now:
    - loads the provided CSV
    - validates AIS observations
    - reconstructs tracks by MMSI
    - loads Track C source hypothesis when available
    - falls back to synthetic source metadata only for controlled synthetic testing
    - filters candidates
    - extracts features
    - scores and ranks candidates
    - persists vessels
    - persists vessel positions
    - persists vessel events
    - persists attribution candidates
    - marks jobs succeeded or failed

- `backend/modules/cases/router.py`
  - Existing endpoints remain in use:
    - `POST /cases/{id}/vessel-analysis`
    - `GET /cases/{id}/candidates`
    - `GET /cases/{id}/candidates/{vessel_id}/evidence`
  - Evidence endpoint now returns raw features, score breakdown, and vessel events.
  - Added downstream explanation/Q&A endpoints:
    - `POST /cases/{id}/candidates/{vessel_id}/explanation`
    - `POST /cases/{id}/investigator/ask`

- `backend/modules/attribution/explanation.py`
  - Adds a grounded explanation layer.
  - Gemini is downstream only.
  - Gemini does not alter score, rank, features, or stored evidence.
  - If Gemini credentials are missing, a deterministic fallback explanation is returned.

- Database migration:
  - `backend/alembic/versions/0002_track_d_candidate_features.py`
  - Adds:
    - `attribution_candidates.raw_features`
    - `attribution_candidates.score_breakdown`

- Regression test:
  - `backend/tests/test_track_d_pipeline.py`
  - Verifies candidate filtering, feature extraction, deterministic six-score output, ranking, and evidence generation.

## Verification Completed

Completed checks:

- Python compile check passed:
  - `python -m compileall backend`

- Unit test passed:
  - `python -m unittest discover -s tests`

- Real CSV smoke test passed:
  - AIS observations loaded: `39,569`
  - vessels reconstructed: `150`
  - candidates discovered: `2`
  - deterministic top candidates:
    - rank 1: MMSI `419000001`, score `76.316`
    - rank 2: MMSI `419000004`, score `76.316`

The equal score is resolved deterministically by MMSI ordering.

## What Still Needs To Be Done

Runtime/database work still pending:

- Apply Alembic migration:
  - `alembic upgrade head`

- Run full stack services:
  - PostgreSQL/PostGIS
  - Redis
  - Celery worker
  - FastAPI backend

- Execute the full API-to-worker flow:
  - create/login user
  - create case
  - run detection/drift or ensure a valid source hypothesis exists
  - call `POST /cases/{id}/vessel-analysis`
  - poll job status
  - verify candidates persisted
  - verify evidence endpoint
  - verify vessel events persisted

- Confirm frontend screens consume the live API rather than static demo data where needed.

- Add stronger integration tests with a real test database.

- Add contract tests for:
  - MMSI to UUID mapping
  - candidate response shape
  - evidence response shape
  - job failure state on exception
  - no LLM mutation of score/rank

## Integration Strategy

The correct production flow should be:

1. Track C produces a `source_hypotheses` row.
2. Track D vessel analysis job is queued through `POST /cases/{id}/vessel-analysis`.
3. Celery runs `workers.drift_worker.run_vessel_analysis`.
4. AIS provider loads observations.
5. Vessels are persisted by MMSI into `vessels`.
6. AIS positions are persisted using `vessels.id` into `vessel_positions`.
7. Candidate filter uses the Track C polygon and source time window.
8. Feature extractor computes raw Track D measurements.
9. Scorer computes deterministic six-dimensional scores.
10. Candidates are ranked and stored in `attribution_candidates`.
11. Events are stored in `vessel_events`.
12. Candidate/evidence APIs read stored results.
13. Gemini explains stored results only after deterministic ranking is complete.

Important boundary:

- MMSI is external vessel identity.
- `vessels.id` is the internal UUID.
- `attribution_candidates.vessel_id`, `vessel_positions.vessel_id`, and `vessel_events.vessel_id` must always use the UUID, not MMSI.

## Is AIS Attribution Correctly Done?

Current answer: partially yes, but not yet fully production-verified.

Correctly done:

- The hardcoded Track D stub has been replaced.
- The provided dataset is loaded and used.
- AIS attribution is split across the intended modules.
- Candidate filtering, feature extraction, scoring, ranking, evidence, and event generation are deterministic.
- Gemini is downstream and cannot change numerical attribution results.
- The scoring contract exposes the six required dimensions.
- MMSI and UUID roles are preserved in persistence logic.

Still not fully proven:

- Full Celery + PostgreSQL/PostGIS execution has not yet been run end-to-end.
- Alembic migration has not yet been applied in a live database.
- The implemented result was smoke-tested against the dataset, but not yet compared line-by-line against every output of `ais.py`.
- The trajectory and source-probability dimensions are still neutral placeholders.
- Gemini grounding was structurally implemented, but live Gemini calls were not tested because no API key was configured.

Therefore, the AIS attribution model is structurally correct and deterministic, but it should be treated as integration-ready rather than fully production-certified.

## Two Pending Models To Add

Two scoring dimensions are currently placeholders and should become real model integrations later.

### 1. Trajectory Compatibility Model

Current placeholder:

- `trajectory = 50.0`
- `trajectory_compatibility = None`

Purpose:

- Compare vessel movement direction/path against Track C drift corridor or hindcast trajectory.

Expected inputs:

- vessel track segment around source time window
- vessel bearing/path geometry
- Track C drift direction or corridor geometry
- source-region polygon
- source time window

Expected output:

- normalized trajectory compatibility score from `0` to `100`
- raw compatibility value stored in `raw_features`
- explanation-safe metadata describing the calculation

Integration location:

- feature extraction in `backend/modules/attribution/features.py`
- score normalization in `backend/modules/attribution/scorer.py`

### 2. Source Probability Model

Current placeholder:

- `source_probability = 0.5`
- `source_probability_score = 50.0`

Purpose:

- Sample Track C probability surface at vessel positions or along vessel track segments near the source window.

Expected inputs:

- Track C probability surface object/key
- source-region probability raster/grid
- vessel positions in source window
- optional confidence from source hypothesis

Expected output:

- source probability value from `0` to `1`
- normalized score from `0` to `100`
- raw value stored in `raw_features`

Integration location:

- Track C/Drift output reader in `backend/modules/drift/`
- feature extraction in `backend/modules/attribution/features.py`
- score normalization in `backend/modules/attribution/scorer.py`

## Recommended Next Build Steps

1. Apply the database migration and run the backend stack.
2. Execute `POST /cases/{id}/vessel-analysis` on a case with a valid source hypothesis.
3. Verify rows in:
   - `vessels`
   - `vessel_positions`
   - `vessel_events`
   - `attribution_candidates`
4. Replace frontend static vessel data with live candidate/evidence API data.
5. Add a test database integration test for the full worker.
6. Add the trajectory compatibility model.
7. Add the source probability model.
8. Run regression comparison against the original `ais.py` outputs and document any numeric differences.

## Known Limitations

- Synthetic AIS is development/test data only and remains labelled as `source="synthetic"`.
- The worker contains a synthetic fallback source hypothesis only for controlled dataset testing when Track C output is absent.
- Real production behavior should prefer Track C `source_hypotheses`.
- Gemini can explain and answer questions, but should not be used as evidence, scoring, or ranking logic.
- Live Gemini testing requires `GEMINI_API_KEY` or equivalent environment configuration.

