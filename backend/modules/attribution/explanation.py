"""Grounded explanation helpers for Track D candidates."""

from __future__ import annotations

import json
import re

import requests

from core.config import settings


SYSTEM_RULES = (
    "You are the SpillGuard Track D explanation layer. The deterministic ranking, "
    "scores, evidence, and events are authoritative. Explain only the supplied data. "
    "Never claim guilt, responsibility, causation, or unsupported probability. "
    "Never change ranks or scores. Never invent evidence, AIS observations, hidden "
    "ground truth, or source-probability surfaces. If a requested detail is absent "
    "from the supplied JSON, explicitly say it is unavailable."
)


def explain_candidate(payload: dict) -> str:
    prompt = (
        "Explain why this attribution candidate received its deterministic result. "
        "Use the stored rank, overall_score, six sub_scores, raw attribution features, "
        "supporting_evidence, contradicting_evidence, vessel_events, and model_version. "
        "Do not calculate or revise any value. Separate measured facts from interpretation "
        "and mention limitations.\n\n"
        f"{json.dumps(payload, default=str, indent=2)}"
    )
    return _ask_gemini(prompt) or _fallback_candidate_explanation(payload)


def answer_investigator(question: str, context: dict) -> str:
    prompt = (
        f"Investigator question: {question}\n\n"
        "Answer using only this stored Track D context. For comparison questions, compare "
        "only the supplied candidate records. Do not calculate or revise scores/ranks. "
        "If the data is insufficient, say so clearly.\n\n"
        f"{json.dumps(context, default=str, indent=2)}"
    )
    return _ask_gemini(prompt) or _fallback_qa_answer(question, context)


def _ask_gemini(prompt: str) -> str | None:
    if not settings.gemini_api_key:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    try:
        response = requests.post(
            url,
            params={"key": settings.gemini_api_key},
            json={
                "system_instruction": {"parts": [{"text": SYSTEM_RULES}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 900},
            },
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException:
        return None
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return "\n".join(part.get("text", "") for part in parts).strip() or None


def _fallback_candidate_explanation(payload: dict) -> str:
    vessel = payload.get("vessel", {})
    scores = payload.get("sub_scores", {})
    strongest = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:2]
    weakest = sorted(scores.items(), key=lambda item: item[1])[:2]
    return (
        f"Facts: MMSI {vessel.get('mmsi')} is ranked #{payload.get('rank')} with deterministic score "
        f"{payload.get('overall_score'):.3f}. Strongest sub-scores: {strongest}; lowest sub-scores: {weakest}. "
        "Interpretation: this is an attribution lead based on Track D consistency checks, not a finding of cause or responsibility."
    )


def _fallback_qa_answer(question: str, context: dict) -> str:
    candidates = context.get("candidates", [])
    if not candidates:
        return "The requested information is not available in the current Track D evidence."

    normalized_question = question.lower()
    selected = _selected_candidate(question, context)
    mentioned = _mentioned_candidates(question, candidates)

    if "higher" in normalized_question and len(mentioned) >= 2:
        first, second = sorted(mentioned[:2], key=lambda candidate: candidate.get("rank", 999999))
        return (
            f"Facts: {first.get('vessel', {}).get('name')} is rank #{first.get('rank')} with stored score "
            f"{first.get('overall_score'):.3f}; {second.get('vessel', {}).get('name')} is rank #{second.get('rank')} "
            f"with stored score {second.get('overall_score'):.3f}. The comparison uses only stored sub-scores: "
            f"{first.get('sub_scores')} versus {second.get('sub_scores')}. Supporting evidence for "
            f"{first.get('vessel', {}).get('name')}: {_evidence_text(first.get('supporting_evidence'))} "
            f"Contradicting evidence for {second.get('vessel', {}).get('name')}: "
            f"{_evidence_text(second.get('contradicting_evidence'))}"
        )
    if "higher" in normalized_question and len(candidates) >= 2:
        top, second = candidates[0], candidates[1]
        return (
            f"Facts: {top.get('vessel', {}).get('name')} is rank #{top.get('rank')} with stored score "
            f"{top.get('overall_score'):.3f}; {second.get('vessel', {}).get('name')} is rank #{second.get('rank')} "
            f"with stored score {second.get('overall_score'):.3f}. Stored sub-scores: "
            f"{top.get('sub_scores')} versus {second.get('sub_scores')}. No scores or ranks were recalculated."
        )

    target = selected or _ranked_candidate_from_question(normalized_question, candidates) or candidates[0]
    if "contributed most" in normalized_question or "features contributed" in normalized_question:
        strongest = _sorted_scores(target, reverse=True)[:3]
        return (
            f"Stored facts for {target.get('vessel', {}).get('name')}: rank #{target.get('rank')} with score "
            f"{target.get('overall_score'):.3f}. The largest stored sub-scores are {strongest}. Raw attribution "
            f"features available for explanation: {json.dumps(target.get('raw_features', {}), default=str)}"
        )
    if "support" in normalized_question:
        return (
            f"Stored supporting evidence for {target.get('vessel', {}).get('name')} at rank #{target.get('rank')}: "
            f"{_evidence_text(target.get('supporting_evidence'))}"
        )
    if "contradict" in normalized_question:
        return (
            f"Stored contradicting evidence for {target.get('vessel', {}).get('name')} at rank #{target.get('rank')}: "
            f"{_evidence_text(target.get('contradicting_evidence'))}"
        )

    return (
        f"Facts: {target.get('vessel', {}).get('name')} (MMSI {target.get('vessel', {}).get('mmsi')}) "
        f"is rank #{target.get('rank')} with deterministic score {target.get('overall_score'):.3f}. "
        f"Stored sub-scores are {target.get('sub_scores')}. Supporting evidence: "
        f"{_evidence_text(target.get('supporting_evidence'))} Contradicting evidence: "
        f"{_evidence_text(target.get('contradicting_evidence'))} This is an investigative lead only, not a claim of cause."
    )


def _selected_candidate(question: str, context: dict) -> dict | None:
    selected_id = context.get("selected_vessel_id")
    if selected_id:
        for candidate in context.get("candidates", []):
            if str(candidate.get("vessel", {}).get("id")) == str(selected_id):
                return candidate
    return None


def _mentioned_candidates(question: str, candidates: list[dict]) -> list[dict]:
    normalized = question.lower()
    matches = []
    for candidate in candidates:
        vessel = candidate.get("vessel", {})
        identifiers = [vessel.get("id"), vessel.get("mmsi"), vessel.get("name")]
        if any(identifier and str(identifier).lower() in normalized for identifier in identifiers):
            matches.append(candidate)
    return matches


def _ranked_candidate_from_question(question: str, candidates: list[dict]) -> dict | None:
    rank_words = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5}
    requested_rank = None
    for word, rank in rank_words.items():
        if word in question:
            requested_rank = rank
            break
    if requested_rank is None:
        match = re.search(r"(?:rank|ranked|#)\s*(\d+)", question)
        requested_rank = int(match.group(1)) if match else None
    if requested_rank is None:
        return None
    return next((candidate for candidate in candidates if candidate.get("rank") == requested_rank), None)


def _sorted_scores(candidate: dict, reverse: bool = False) -> list[tuple[str, float]]:
    return sorted((candidate.get("sub_scores") or {}).items(), key=lambda item: item[1], reverse=reverse)


def _evidence_text(items: list[str] | None) -> str:
    if not items:
        return "unavailable in the stored candidate evidence."
    return "; ".join(items)
