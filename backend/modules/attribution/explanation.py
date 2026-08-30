"""Grounded explanation helpers for Track D candidates."""

from __future__ import annotations

import json

import requests

from core.config import settings


SYSTEM_RULES = (
    "You are the SpillGuard Track D explanation layer. The deterministic ranking, "
    "scores, evidence, and events are authoritative. Explain only the supplied data. "
    "Never claim guilt, responsibility, causation, or unsupported probability. "
    "Never change ranks or scores."
)


def explain_candidate(payload: dict) -> str:
    prompt = (
        "Explain why this attribution candidate received its deterministic result. "
        "Separate measured facts from interpretation and mention limitations.\n\n"
        f"{json.dumps(payload, default=str, indent=2)}"
    )
    return _ask_gemini(prompt) or _fallback_candidate_explanation(payload)


def answer_investigator(question: str, context: dict) -> str:
    prompt = (
        f"Investigator question: {question}\n\n"
        "Answer using only this Track D context. If the data is insufficient, say so clearly.\n\n"
        f"{json.dumps(context, default=str, indent=2)}"
    )
    return _ask_gemini(prompt) or _fallback_qa_answer(question, context)


def _ask_gemini(prompt: str) -> str | None:
    if not settings.gemini_api_key:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
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
    top = candidates[0]
    return (
        f"Facts: the current top attribution candidate is MMSI {top.get('vessel', {}).get('mmsi')} "
        f"at rank #{top.get('rank')} with deterministic score {top.get('overall_score'):.3f}. "
        "Interpretation: answers are limited to the stored Track D features, evidence, and events."
    )
