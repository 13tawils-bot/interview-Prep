"""Scorecard schema and progress aggregation."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from .prompts import BD_DIMENSIONS

HireSignal = Literal["strong_no", "no", "lean_no", "lean_yes", "yes", "strong_yes"]


class DimensionScore(BaseModel):
    dimension: str
    score: int
    evidence: str
    fix: str


class AnswerReview(BaseModel):
    question: str
    verdict: str
    what_worked: str
    what_hurt: str
    stronger_answer: str


class Scorecard(BaseModel):
    overall: int
    hire_signal: HireSignal
    headline: str
    dimensions: list[DimensionScore]
    answer_reviews: list[AnswerReview]
    top_strengths: list[str]
    priority_fixes: list[str]
    drills: list[str]
    next_focus: list[str]


JobFitLabel = Literal["strong", "stretch", "skip"]


class JobFit(BaseModel):
    job_id: str
    fit: JobFitLabel
    reason: str
    gaps: str


class JobFitBatch(BaseModel):
    results: list[JobFit]


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


def normalize(card: Scorecard) -> Scorecard:
    """Clamp scores into range and drop dimensions we don't track.

    Structured outputs guarantees the shape, not numeric bounds, so enforce
    them here rather than in the schema.
    """
    card.overall = _clamp(card.overall, 1, 10)
    dims = []
    for d in card.dimensions:
        if d.dimension in BD_DIMENSIONS:
            d.score = _clamp(d.score, 1, 5)
            dims.append(d)
    dims.sort(key=lambda d: list(BD_DIMENSIONS).index(d.dimension))
    card.dimensions = dims
    card.next_focus = [f for f in card.next_focus if f in BD_DIMENSIONS]
    return card


def render_markdown(card: Scorecard, title: str) -> str:
    lines = [
        f"# {title}",
        "",
        f"**Overall: {card.overall}/10 · Hire signal: {card.hire_signal.replace('_', ' ')}**",
        "",
        card.headline,
        "",
        "## Scores",
        "",
        "| Dimension | Score | Evidence | Fix |",
        "|---|---|---|---|",
    ]
    for d in card.dimensions:
        bar = "●" * d.score + "○" * (5 - d.score)
        lines.append(f"| {d.dimension} | {bar} {d.score}/5 | {_cell(d.evidence)} | {_cell(d.fix)} |")
    lines += ["", "## Strengths", *[f"- {s}" for s in card.top_strengths]]
    lines += ["", "## Priority fixes", *[f"{i}. {s}" for i, s in enumerate(card.priority_fixes, 1)]]
    lines += ["", "## Answer reviews"]
    for i, r in enumerate(card.answer_reviews, 1):
        lines += [
            "",
            f"### Q{i}. {r.question}",
            f"**Verdict:** {r.verdict}",
            "",
            f"- **Worked:** {r.what_worked}",
            f"- **Hurt:** {r.what_hurt}",
            "",
            "**Stronger answer:**",
            "",
            *[f"> {line}" if line else ">" for line in r.stronger_answer.splitlines()],
        ]
    lines += ["", "## Drills for the next 48 hours", *[f"- [ ] {s}" for s in card.drills]]
    if card.next_focus:
        lines += ["", f"**Next mock should target:** {', '.join(card.next_focus)}"]
    return "\n".join(lines) + "\n"


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def dimension_averages(cards: list[dict], last_n: int | None = None) -> dict[str, float]:
    """Average score per dimension across saved scorecards (as dicts)."""
    if last_n:
        cards = cards[-last_n:]
    totals: dict[str, list[int]] = {name: [] for name in BD_DIMENSIONS}
    for card in cards:
        for d in card.get("dimensions", []):
            if d["dimension"] in totals:
                totals[d["dimension"]].append(d["score"])
    return {k: sum(v) / len(v) for k, v in totals.items() if v}


def weakest_dimensions(cards: list[dict], n: int = 3) -> list[str]:
    """Dimensions to focus on next, weighted toward recent sessions."""
    if not cards:
        return []
    recent = dimension_averages(cards, last_n=3)
    return [name for name, _ in sorted(recent.items(), key=lambda kv: kv[1])[:n]]
