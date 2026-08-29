from uuid import UUID

from pydantic import BaseModel, Field

from schemas.vessel import VesselOut


class SubScores(BaseModel):
    spatial: float
    temporal: float
    trajectory: float
    source_probability: float
    behavioural: float
    ais_continuity: float


class AttributionCandidate(BaseModel):
    id: UUID
    case_id: UUID
    vessel: VesselOut
    overall_score: float = Field(ge=0, le=100)
    sub_scores: SubScores
    rank: int
    supporting_evidence: list[str]
    contradicting_evidence: list[str]
    model_version: str
    excluded_by_analyst: bool = False
