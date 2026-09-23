from types import SimpleNamespace

import pytest

from interview_prep import store
from interview_prep.interview import MarkerFilter, run_mock, score_mock
from interview_prep.prompts import BD_DIMENSIONS, END_MARKER, MODES, PERSONAS, interviewer_instructions
from interview_prep.scoring import (
    DimensionScore,
    Scorecard,
    dimension_averages,
    normalize,
    render_markdown,
    weakest_dimensions,
)

PROFILE = {
    "company": "Acme Cloud",
    "role": "Director, Strategic Partnerships",
    "job_description": "Own the partner ecosystem.",
    "resume": "Closed a $2M ACV reseller deal.",
    "notes": "",
}


def _message(text):
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], stop_reason="end_turn")


class FakeCoach:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def stream_turn(self, system, messages, on_text, effort="medium"):
        self.calls.append([dict(m) for m in messages])
        text = self.replies.pop(0)
        for i in range(0, len(text), 5):  # stream in small chunks
            on_text(text[i : i + 5])
        return _message(text)

    def scorecard(self, system, transcript):
        self.transcript = transcript
        return _card([3] * len(BD_DIMENSIONS))


def _card(scores, overall=6):
    return Scorecard(
        overall=overall,
        hire_signal="lean_yes",
        headline="Solid but vague on numbers.",
        dimensions=[
            DimensionScore(dimension=name, score=s, evidence="e", fix="f")
            for name, s in zip(BD_DIMENSIONS, scores)
        ],
        answer_reviews=[],
        top_strengths=["x"],
        priority_fixes=["y"],
        drills=["z"],
        next_focus=["Commercial impact"],
    )


def _inputs(*answers):
    it = iter(answers)
    return lambda: next(it, None)


def test_marker_filter_hides_split_marker():
    out = []
    f = MarkerFilter(out.append)
    text = f"Thanks for your time.\n{END_MARKER}\n"
    for i in range(0, len(text), 3):
        f(text[i : i + 3])
    f.flush()
    assert "".join(out) == "Thanks for your time.\n\n"


def test_mock_runs_until_end_marker_and_scores():
    coach = FakeCoach(["Tell me about a deal.", "How big was it?", f"Thanks!\n{END_MARKER}"])
    written = []
    result = run_mock(
        coach, PROFILE, None, mode="deal", persona="skeptic", num_questions=2,
        focus_areas=["Deal craft"], read_answer=_inputs("I closed a reseller deal.", "/hint"),
        write=written.append,
    )
    assert not result.aborted
    assert [t["speaker"] for t in result.transcript] == [
        "interviewer", "candidate", "interviewer", "note", "interviewer",
    ]
    assert result.transcript[-1]["text"] == "Thanks!"
    assert END_MARKER not in "".join(written)
    # /hint is sent to the interviewer as an out-of-band request
    assert coach.calls[-1][-1] == {"role": "user", "content": "[HINT]"}

    card = score_mock(coach, PROFILE, None, result)
    assert "CANDIDATE: I closed a reseller deal." in coach.transcript
    assert card.overall == 6


def test_quit_aborts_and_eof_wraps_up():
    coach = FakeCoach(["Q1?"])
    result = run_mock(
        coach, PROFILE, None, mode="mixed", persona="recruiter", num_questions=1,
        focus_areas=[], read_answer=_inputs("/quit"), write=lambda s: None,
    )
    assert result.aborted

    coach = FakeCoach(["Q1?", f"Bye.{END_MARKER}"])
    result = run_mock(
        coach, PROFILE, None, mode="mixed", persona="recruiter", num_questions=1,
        focus_areas=[], read_answer=_inputs(), write=lambda s: None,
    )
    assert coach.calls[-1][-1]["content"] == "[WRAP UP]"


def test_interviewer_instructions_cover_all_modes_and_personas():
    for mode in MODES:
        for persona in PERSONAS:
            text = interviewer_instructions(mode, persona, 4, ["Deal craft"])
            assert END_MARKER in text and "Deal craft" in text


def test_normalize_clamps_and_filters():
    card = _card([9, 0, 3, 3, 3, 3, 3, 3], overall=14)
    card.dimensions.append(DimensionScore(dimension="Made up", score=3, evidence="", fix=""))
    card.next_focus = ["Deal craft", "Nope"]
    card = normalize(card)
    assert card.overall == 10
    assert [d.score for d in card.dimensions][:2] == [5, 1]
    assert len(card.dimensions) == len(BD_DIMENSIONS)
    assert card.next_focus == ["Deal craft"]
    assert "Overall: 10/10" in render_markdown(card, "t")


def test_progress_aggregation_prefers_recent_sessions():
    old = _card([1, 5, 5, 5, 5, 5, 5, 5]).model_dump()
    recent = [_card([5, 5, 5, 5, 5, 5, 2, 5]).model_dump() for _ in range(3)]
    cards = [old] + recent
    assert dimension_averages(cards)["Commercial impact"] == pytest.approx(4.0)
    assert weakest_dimensions(cards, n=1) == ["Executive presence"]


def test_store_roundtrip(tmp_path):
    p = store.Profile("acme", root=tmp_path)
    p.save(PROFILE)
    store.set_active("acme", root=tmp_path)
    assert store.get_active(root=tmp_path) == "acme"
    assert store.list_profiles(root=tmp_path) == ["acme"]
    p.save_session({"mode": "mixed", "scorecard": _card([3] * 8).model_dump()}, "# card")
    assert len(p.scorecards()) == 1
    assert store.slugify("Acme, Inc.", "Sr. BD Manager") == "acme-inc-sr-bd-manager"


def test_scorecard_schema_is_structured_output_compatible():
    from anthropic.lib._parse._transform import transform_schema

    schema = transform_schema(Scorecard)
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(Scorecard.model_fields)


def test_default_resume(tmp_path):
    assert store.load_default_resume(root=tmp_path) is None
    store.save_default_resume("CV text", root=tmp_path)
    assert store.load_default_resume(root=tmp_path) == "CV text"
