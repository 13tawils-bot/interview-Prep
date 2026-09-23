"""The live mock interview loop, independent of the terminal so it can be tested."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable

from .prompts import (
    END_MARKER,
    SCORECARD_INSTRUCTIONS,
    context_system_blocks,
    interviewer_instructions,
)
from .scoring import Scorecard

COMMANDS = {
    "/hint": "[HINT]",
    "/skip": "[SKIP]",
    "/end": "[WRAP UP]",
}
QUIT = "/quit"
MAX_TURNS = 80


class MarkerFilter:
    """Pass streamed text through while hiding END_MARKER, even if split across chunks."""

    def __init__(self, write: Callable[[str], None]):
        self.write = write
        self.pending = ""

    def __call__(self, text: str) -> None:
        self.pending += text
        self.pending = self.pending.replace(END_MARKER, "")
        # Hold back any tail that could be the start of the marker.
        keep = 0
        for n in range(1, min(len(END_MARKER), len(self.pending)) + 1):
            if END_MARKER.startswith(self.pending[-n:]):
                keep = n
        emit = self.pending[: len(self.pending) - keep]
        self.pending = self.pending[len(self.pending) - keep :]
        if emit:
            self.write(emit)

    def flush(self) -> None:
        if self.pending:
            self.write(self.pending)
            self.pending = ""


@dataclass
class MockResult:
    mode: str
    persona: str
    transcript: list[dict] = field(default_factory=list)
    aborted: bool = False
    scorecard: Scorecard | None = None
    started_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))

    def transcript_text(self) -> str:
        return "\n\n".join(f"{t['speaker'].upper()}: {t['text']}" for t in self.transcript)

    def to_record(self) -> dict:
        return {
            "started_at": self.started_at,
            "mode": self.mode,
            "persona": self.persona,
            "aborted": self.aborted,
            "transcript": self.transcript,
            "scorecard": self.scorecard.model_dump() if self.scorecard else None,
        }


def run_mock(
    coach,
    profile: dict,
    dossier: str | None,
    *,
    mode: str,
    persona: str,
    num_questions: int,
    focus_areas: list[str],
    read_answer: Callable[[], str | None],
    write: Callable[[str], None],
    on_turn_start: Callable[[str], None] = lambda speaker: None,
) -> MockResult:
    system = context_system_blocks(
        profile, dossier, interviewer_instructions(mode, persona, num_questions, focus_areas)
    )
    messages: list[dict] = [{"role": "user", "content": "(The candidate has joined the interview.)"}]
    result = MockResult(mode=mode, persona=persona)

    for _ in range(MAX_TURNS):
        on_turn_start("interviewer")
        out = MarkerFilter(write)
        message = coach.stream_turn(system, messages, on_text=out)
        out.flush()
        messages.append({"role": "assistant", "content": message.content})
        text = "".join(b.text for b in message.content if b.type == "text")
        result.transcript.append({"speaker": "interviewer", "text": text.replace(END_MARKER, "").strip()})
        if END_MARKER in text:
            break

        on_turn_start("candidate")
        answer = read_answer()
        if answer is None:
            answer = "/end"
        answer = answer.strip()
        if answer.lower() == QUIT:
            result.aborted = True
            return result
        command = COMMANDS.get(answer.lower())
        if command:
            result.transcript.append({"speaker": "note", "text": f"Candidate used {answer.lower()}"})
            messages.append({"role": "user", "content": command})
        else:
            result.transcript.append({"speaker": "candidate", "text": answer})
            messages.append({"role": "user", "content": answer or "(no answer)"})
    return result


def score_mock(coach, profile: dict, dossier: str | None, result: MockResult) -> Scorecard:
    system = context_system_blocks(profile, dossier, SCORECARD_INSTRUCTIONS)
    transcript = (
        f"Interview format: {result.mode}. Interviewer persona: {result.persona}.\n\n"
        f"<transcript>\n{result.transcript_text()}\n</transcript>"
    )
    return coach.scorecard(system, transcript)
