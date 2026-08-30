# SpillGuard Full System Requirements And Integration Report

Date: 2026-08-30

## Purpose

This document is the current whole-system report for SpillGuard. It summarizes what frontend work has been completed, what backend work exists, what backend work is still required, how the frontend and backend must integrate, whether the AIS attribution implementation is correctly structured, and how unfinished models should be represented as placeholders until production implementations are ready.

## Current System Goal

SpillGuard is an AI-assisted maritime pollution forensic-intelligence system. The intended workflow is:

1. Create or select an investigation case with AOI and time window.
2. Ingest a SAR scene automatically or through upload.
3. Validate scene jurisdiction against the India EEZ.
4. Run oil slick detection on the SAR scene.
5. Run drift hindcast to reconstruct probable source region and release window.
6. Run forward forecast for response planning.
7. Load AIS vessel tracks around the source region/time window.
8. Filter and score candidate vessels.
9. Show ranked vessel leads with transparent evidence.
10. Let investigators review, exclude, annotate, close, and report the case.

## Frontend Work Completed

The frontend already has a strong operational user experience and visual pipeline scaffold.

Implemented frontend areas:

- Case intake screen with case metadata form.
- Automatic ingestion and upload scene tabs.
- Pipeline stepper for scene, detection, drift, vessel attribution, and report stages.
- API calls for case creation, observation creation, detection trigger, drift trigger, vessel-analysis trigger, and job polling.
- Operational console showing the full incident workflow from SAR ingestion to transparent suspect ranking.
- Leaflet map canvas with staged layers:
  - India EEZ validation.
  - SAR scene footprint.
  - Oil slick mask.
  - Hindcast trajectory.
  - Probable source region.
  - Forward forecast spread contours.
  - AIS tracks.
  - Ranked suspect vessel pins.
- Vessel ranking screen with rank, MMSI, vessel type, score bars, evidence navigation, and analyst exclude UI.
- Evidence explorer screen with score breakdown, supporting evidence, contradicting evidence, and AI explanation panel.
- Spill, source, reports, audit, timeline, map, login, and case shell screens exist as user-facing surfaces.

Important frontend limitation:

- Most investigation detail screens still read from `frontend/src/data/operational.ts`.
- `OperationalConsole`, `MapCanvas`, `VesselRanking`, `EvidenceExplorer`, `SpillPanel`, `SourcePanel`, `MapView`, and `CaseList` are still mostly static/demo-backed.
- `CaseIntake` is the main screen already wired to backend API workflow triggers and job polling.

## Backend Work Completed

The backend is scaffolded with FastAPI, PostgreSQL/PostGIS schema, Celery jobs, and module boundaries.

Implemented backend areas:

- Authentication:
  - `POST /auth/login`
  - JWT token creation and validation.

- Cases:
  - `POST /cases`
  - `GET /cases`
  - `GET /cases/{id}`
  - `POST /cases/{id}/observations`
  - `POST /cases/{id}/feedback`

- Job workflow:
  - `POST /cases/{id}/detect`
  - `POST /cases/{id}/drift`
  - `POST /cases/{id}/vessel-analysis`
  - `GET /jobs/{id}`

- Drift/source APIs:
  - `GET /cases/{id}/source-hypothesis`
  - `GET /cases/{id}/forecast`

- Attribution APIs:
  - `GET /cases/{id}/candidates`
  - `GET /cases/{id}/candidates/{vessel_id}/evidence`
  - `POST /cases/{id}/candidates/{vessel_id}/explanation`
  - `POST /cases/{id}/investigator/ask`

- AIS API:
  - `GET /vessels?bbox=...&start=...&end=...`

- Reports:
  - Report endpoints exist as a backend module.

- Database:
  - PostGIS schema exists for users, cases, satellite scenes, oil slicks, environmental fields, drift runs, source hypotheses, forward forecasts, vessels, vessel positions, vessel events, attribution candidates, jobs, analyst reviews, reports, and model versions.
  - Track D migration adds persisted raw attribution features and score breakdown where needed.

## AIS And Attribution Folder Structure

Current structure:

- `backend/modules/ais/`
  - Responsible for AIS data loading/provider concerns.
  - Current implementation is synthetic CSV based.

- `backend/modules/attribution/`
  - Responsible for source-window filtering, feature extraction, scoring, ranking, evidence, geospatial helpers, and explanation.

This split is correct.

Reason:

- AIS is a data-source layer. It should know how to load, validate, normalize, and later switch between synthetic, live, uploaded, or paid AIS providers.
- Attribution is an analysis layer. It should consume normalized AIS tracks plus Track C source hypotheses and produce candidate scores/evidence.
- Keeping them separate prevents AIS ingestion code from owning scoring logic and prevents attribution logic from depending on one fixed AIS provider.

Current implementation status:

- Structurally correct.
- Deterministic.
- Integration-ready.
- Not yet fully production-certified because the full live database/Celery/API/frontend flow still needs to be run and verified end to end.

## AIS Attribution Work Completed

Implemented files:

- `backend/modules/ais/synthetic.py`
  - Loads synthetic AIS CSV.
  - Normalizes records into `AISObservation`.
  - Preserves MMSI, IMO, vessel name, flag, vessel type, timestamp, latitude, longitude, SOG, COG, heading, nav status, source, case metadata, and controlled source ground truth when available.
  - Validates empty datasets, invalid coordinates, and unsupported source values.

- `backend/modules/attribution/filter.py`
  - Filters candidate tracks using source-region polygon, time window, spatial buffer, and temporal buffer.

- `backend/modules/attribution/features.py`
  - Computes spatial proximity.
  - Computes time in source region.
  - Computes temporal overlap.
  - Computes vessel bearing.
  - Computes speed anomaly.
  - Computes loitering duration.
  - Detects AIS gaps.
  - Detects source-region entry and exit events.
  - Stores placeholder values for future trajectory compatibility and source probability models.

- `backend/modules/attribution/scorer.py`
  - Produces deterministic scores from `0` to `100`.
  - Preserves six score dimensions:
    - spatial
    - temporal
    - trajectory
    - source_probability
    - behavioural
    - ais_continuity
  - Uses deterministic MMSI tie-break ordering.
  - Does not use Gemini or any LLM for score or rank.

- `backend/workers/drift_worker.py`
  - `run_vessel_analysis` loads AIS, validates it, reconstructs vessel tracks, loads Track C source hypothesis, filters candidates, extracts features, scores/ranks candidates, persists vessel data, persists events, persists candidates, and updates the job state.

- `backend/modules/attribution/explanation.py`
  - Adds explanation/Q&A layer.
  - Gemini is downstream only.
  - Gemini cannot mutate score, rank, raw features, or stored evidence.
  - Deterministic fallback explanation is returned when Gemini credentials are not configured.

## AIS Attribution Correctness Assessment

Answer: mostly correct for current integration stage, but not final production complete.

Correctly implemented:

- The AIS and attribution folders are separated properly.
- The AIS provider currently labels data as synthetic, which is correct for controlled test data.
- MMSI is treated as external vessel identity.
- `vessels.id` is treated as the internal database UUID.
- `attribution_candidates.vessel_id`, `vessel_positions.vessel_id`, and `vessel_events.vessel_id` use internal UUIDs.
- Candidate filtering, features, scoring, evidence, events, and ranking are deterministic.
- LLM/Gemini is only an explanation layer and does not control numerical results.
- Raw features and score breakdown are persisted for auditability.

Still pending:

- Apply migrations to a live database.
- Run PostgreSQL/PostGIS, Redis, Celery, FastAPI, and frontend together.
- Execute a full real API flow from case creation through candidate display.
- Compare outputs against the original AIS notebook/script if exact parity is required.
- Replace the synthetic fallback source hypothesis with strict Track C dependency for production mode.
- Replace two neutral scoring placeholders with actual models.

## Current Placeholder Models

Two attribution score dimensions are intentionally placeholders right now.

### Placeholder 1: Trajectory Compatibility

Current behavior:

- `trajectory_compatibility = None`
- `trajectory` score = `50.0`

Why this is acceptable now:

- It keeps the six-dimensional attribution contract stable.
- It avoids pretending trajectory physics is implemented when it is not.
- It allows frontend score bars, database fields, evidence payloads, and reports to integrate now.

Required future implementation:

- Compare vessel track direction and movement path with Track C hindcast corridor.
- Use source region, drift vector/corridor, release window, vessel COG/bearing, and track geometry.
- Output a normalized score from `0` to `100`.
- Persist raw compatibility value in `raw_features`.
- Add model version metadata in `score_breakdown`.

Recommended integration files:

- `backend/modules/attribution/features.py`
- `backend/modules/attribution/scorer.py`
- `backend/modules/drift/engine.py` or a Track C output reader/helper.

### Placeholder 2: Source Probability

Current behavior:

- `source_probability = 0.5`
- `source_probability` score = `50.0`

Why this is acceptable now:

- The database/API/frontend contract already expects a source probability score.
- Track C probability surface reading is not fully implemented yet.
- A neutral midpoint prevents this dimension from unfairly dominating or excluding candidates.

Required future implementation:

- Read the Track C probability surface from `source_hypotheses.probability_surface_object_key`.
- Sample probability at vessel positions or along vessel track segments near the release window.
- Aggregate sampled probabilities into one candidate-level source probability.
- Output raw probability from `0` to `1`.
- Normalize to score from `0` to `100`.
- Store raw value and model version.

Recommended integration files:

- `backend/modules/drift/`
- `backend/modules/attribution/features.py`
- `backend/modules/attribution/scorer.py`

## Other System Models To Placeholder For Now

The system should keep contracts stable for all major models, even while some implementations remain stubs or deterministic baselines.

| Model | Current status | Placeholder requirement | Future production requirement |
| --- | --- | --- | --- |
| SAR ingestion | UI and search flow exist | Return scene metadata with footprint, sensor, acquisition time, object key | Integrate real Sentinel/Copernicus/STAC source and object storage |
| EEZ validation | Frontend visual exists | Store jurisdiction decision and reason | Use authoritative EEZ polygon and geospatial intersection |
| Oil slick detection | Backend job path exists | Return deterministic demo slick geometry and `model_version` | Run trained segmentation model on SAR raster |
| Lookalike classification | Schema supports flag/reason | Default `possible_lookalike=false` unless test data says otherwise | Add model/rules for ship wakes, algae, low wind, natural slicks |
| Drift hindcast | Backend stub writes source hypothesis | Use lightweight deterministic polygon/time-window output | Integrate ocean current/wind fields and validated particle model |
| Forward forecast | Backend stub writes forecast contours | Return 50/80/95 contour polygons | Generate probabilistic forecast from same drift engine |
| AIS provider | Synthetic CSV provider works | Keep source labelled `synthetic` | Add real AIS provider/import adapter |
| AIS attribution | Deterministic implementation exists | Keep trajectory/source-probability neutral | Add trajectory compatibility and probability-surface sampling |
| LLM explanation | Gemini fallback structure exists | Explain stored facts only | Add guarded Gemini calls with prompt/version logging |
| Report generation | Module exists | Generate simple JSON/PDF shell from stored rows | Generate signed investigator-ready case report |

## Required Backend Work

Priority backend requirements:

1. Apply database migrations.
2. Verify `0001_init_schema` and Track D migration are consistent, because `raw_features` and `score_breakdown` appear in the initialized schema and also in the Track D migration path.
3. Run full local stack with PostgreSQL/PostGIS, Redis, Celery worker, FastAPI backend, and frontend.
4. Seed a real user and validate login from frontend.
5. Confirm `POST /cases` works with frontend AOI payload.
6. Implement or validate scene search against real or seeded `satellite_scenes`.
7. Ensure upload/automatic scene attachment creates or links actual `satellite_scenes`, not only analyst observation notes.
8. Replace detection stub with a stable placeholder service that always persists an `oil_slicks` row and returns its ID.
9. Replace drift stub with a stable placeholder service that persists `drift_runs`, `source_hypotheses`, and `forward_forecasts`.
10. Run `POST /cases/{id}/vessel-analysis` against a case with a valid source hypothesis.
11. Confirm candidates, evidence, and events persist correctly.
12. Add frontend-facing endpoints for slick detail if missing from the case flow.
13. Add frontend-facing endpoints for candidate tracks/geometries so the map can render real AIS paths.
14. Add report generation from stored case, slick, source, forecast, candidates, evidence, and analyst review rows.
15. Add integration tests using a real test database.

## Required Frontend Integration Work

Priority frontend requirements:

1. Replace static `operationalCases` with `GET /cases`.
2. Replace static slick panel data with backend slick detail endpoint.
3. Replace static source panel data with `GET /cases/{id}/source-hypothesis`.
4. Replace static forecast map data with `GET /cases/{id}/forecast`.
5. Replace static vessel ranking data with `GET /cases/{id}/candidates`.
6. Replace static evidence explorer data with `GET /cases/{id}/candidates/{vessel_id}/evidence`.
7. Add API client functions for candidates, evidence, source hypothesis, forecast, reports, and feedback.
8. Wire exclude button to `POST /cases/{id}/feedback` with `action="exclude_candidate"`.
9. Add loading, empty, and failed states for every case detail panel.
10. Make map layers accept live GeoJSON props instead of importing static operational data internally.
11. Add live AIS track rendering from backend vessel/candidate track endpoint.
12. Keep demo fallback data only behind an explicit demo/offline mode flag.

## Frontend And Backend Integration Contract

The frontend should treat the backend as the source of truth after a case is created.

Minimum required API flow:

1. `POST /auth/login`
   - Returns bearer token.

2. `POST /cases`
   - Creates case with title, AOI polygon, time window start, and time window end.

3. `GET /scenes/search`
   - Finds available SAR scenes for bbox and time window.

4. `POST /cases/{id}/observations`
   - Records investigator note or intake metadata.

5. `POST /cases/{id}/detect`
   - Queues detection job.

6. `GET /jobs/{job_id}`
   - Polls until detection succeeds.
   - Detection job `result_ref` must be the slick ID.

7. `POST /cases/{id}/drift`
   - Queues drift job using slick ID.

8. `GET /jobs/{job_id}`
   - Polls until drift succeeds.
   - Drift job must create source hypothesis and forecast contours.

9. `POST /cases/{id}/vessel-analysis`
   - Queues AIS attribution.

10. `GET /jobs/{job_id}`
   - Polls until vessel analysis succeeds.
   - Vessel job `result_ref` may be first/top candidate ID.

11. `GET /cases/{id}/candidates`
   - Returns ranked vessel candidates.

12. `GET /cases/{id}/candidates/{vessel_id}/evidence`
   - Returns raw features, score breakdown, events, supporting evidence, and contradicting evidence.

13. `POST /cases/{id}/candidates/{vessel_id}/explanation`
   - Returns explanation based only on stored deterministic evidence.

14. `POST /cases/{id}/feedback`
   - Records analyst decisions.

15. `POST /cases/{id}/reports`
   - Generates report from stored case facts.

## Data Identity Rules

These rules must stay strict:

- Case ID is UUID from `cases.id`.
- Slick ID is UUID from `oil_slicks.id`.
- Drift run ID is UUID from `drift_runs.id`.
- Source hypothesis ID is UUID from `source_hypotheses.id`.
- MMSI is an external vessel identifier.
- Vessel UUID is internal `vessels.id`.
- Candidate APIs should route by internal `vessels.id`, not MMSI.
- UI may display MMSI but must use vessel UUID for backend evidence and feedback calls.
- Score/rank must come from stored backend rows, not frontend recomputation.

## Database Requirements

Required persistence:

- `cases`: investigation metadata.
- `satellite_scenes`: SAR scene metadata and footprint.
- `oil_slicks`: detected slick geometry and model output.
- `environmental_fields`: wind/current field references.
- `drift_runs`: model execution records.
- `source_hypotheses`: source polygon, release window, confidence, probability surface object key.
- `forward_forecasts`: forecast envelope polygons.
- `vessels`: normalized vessel registry rows.
- `vessel_positions`: AIS track points.
- `vessel_events`: derived evidence events.
- `attribution_candidates`: ranked scored candidates.
- `jobs`: async status tracking.
- `analyst_reviews`: feedback/audit actions.
- `reports`: generated report references.
- `model_versions`: model/version/metrics registry.

Migration note:

- If `raw_features` and `score_breakdown` are already in a fresh `0001_init_schema`, the Track D migration must be safe for existing databases that do not have those columns and for fresh databases that already do. Use idempotent checks or align the schema/migration history before team handoff.

## Testing Requirements

Minimum test coverage required before final demo:

- Backend unit tests for AIS CSV loading and validation.
- Backend unit tests for candidate filtering.
- Backend unit tests for feature extraction.
- Backend unit tests for deterministic scoring/ranking.
- Backend unit tests proving Gemini cannot mutate score/rank.
- API tests for candidate list and evidence payload shape.
- Worker integration test using PostgreSQL/PostGIS.
- Full pipeline test from case creation to vessel candidates.
- Frontend API integration test for case intake job polling.
- Frontend render test for candidates/evidence loading states.
- End-to-end test for create case, attach scene, run pipeline, view ranking, view evidence, exclude candidate.

Completed checks already reported for Track D:

- Python compile check passed.
- Unit test discovery passed.
- Synthetic CSV smoke test loaded 39,569 AIS observations, reconstructed 150 vessels, and produced 2 deterministic candidates.

## Production Readiness Gaps

The system is not production complete yet.

Critical gaps:

- Real SAR ingestion is not fully connected.
- SAR upload storage/processing needs a real object flow.
- Oil slick detection is still a placeholder/stub flow.
- Drift model is still a placeholder/stub flow.
- Environmental data integrations are not complete.
- AIS provider is synthetic only.
- Trajectory and source-probability attribution dimensions are placeholders.
- Frontend operational screens are mostly static demo-backed.
- Live full-stack execution has not yet been proven.
- Real report generation is not complete.
- Authentication/authorization needs hardening for multi-user production.
- Error handling and retry policies need strengthening around workers.

## Recommended Build Order

Recommended next implementation order:

1. Stabilize migrations and run database upgrade.
2. Run full stack locally.
3. Seed user and test login.
4. Make detection placeholder persist a real slick row every time.
5. Make drift placeholder persist a real source hypothesis and forecast every time.
6. Run vessel analysis on a real case/source hypothesis.
7. Add missing frontend API client functions.
8. Wire candidate list and evidence screens to live backend.
9. Refactor map to accept live case/slick/source/forecast/vessel props.
10. Add feedback integration for candidate exclusion and notes.
11. Add simple report generation.
12. Add full integration tests.
13. Replace placeholder trajectory model.
14. Replace placeholder source probability model.
15. Replace synthetic AIS with real AIS adapter.
16. Replace detection/drift placeholders with production models.

## Final Status Summary

Frontend status:

- Strong demo-quality operational UI exists.
- Case intake is partially backend-integrated.
- Most detail views still need live API wiring.

Backend status:

- Core schema, routers, workers, and AIS attribution logic exist.
- Track D AIS attribution is the most concrete backend model implementation.
- Detection and drift are still placeholder-level.

AIS attribution status:

- Folder split is correct.
- Implementation is correct for deterministic integration stage.
- It should be treated as integration-ready, not production-certified.

Model placeholder status:

- Other unfinished models should keep stable contracts and return clearly labelled placeholder outputs.
- Never allow placeholders to appear as final scientific certainty.
- Store `model_version`, raw features/outputs, and evidence metadata for every placeholder and final model.

