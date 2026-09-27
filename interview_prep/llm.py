"""Thin wrapper over the Anthropic SDK for the three kinds of calls we make.

- stream_turn: one streamed assistant turn (interviewer replies, brief writing)
- research:    web-search/web-fetch agent that writes the company dossier
- scorecard:   structured-output grading of a finished mock
"""

from __future__ import annotations

import os
from typing import Callable

import anthropic

from .scoring import JobFit, JobFitBatch, Scorecard, normalize

MODEL = os.environ.get("PREP_MODEL", "claude-opus-5")

# Server-side refusal fallbacks: if a request is declined by a safety
# classifier, the API re-runs it on Anthropic's recommended fallback model.
FALLBACK_BETA = "server-side-fallback-2026-07-01"

RESEARCH_TOOLS = [
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 12},
    {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 8},
]

MAX_PAUSE_RESUMES = 5


class RefusalError(RuntimeError):
    pass


def _check(message) -> None:
    if message.stop_reason == "refusal":
        detail = getattr(message.stop_details, "explanation", None) if message.stop_details else None
        raise RefusalError(detail or "The model declined this request.")


def _text(message) -> str:
    return "".join(b.text for b in message.content if b.type == "text")


class Coach:
    def __init__(self, client: anthropic.Anthropic | None = None, model: str = MODEL):
        self.client = client or anthropic.Anthropic()
        self.model = model

    def _common(self, effort: str) -> dict:
        return {
            "model": self.model,
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": effort},
            "betas": [FALLBACK_BETA],
            "fallbacks": "default",
        }

    def stream_turn(
        self,
        system: list[dict],
        messages: list[dict],
        on_text: Callable[[str], None],
        effort: str = "medium",
    ):
        """Stream one assistant turn, returning the final message.

        Callers should append ``message.content`` (not just the text) to the
        history so thinking blocks round-trip unchanged.
        """
        with self.client.beta.messages.stream(
            max_tokens=64000,
            system=system,
            messages=messages,
            **self._common(effort),
        ) as stream:
            for text in stream.text_stream:
                on_text(text)
            message = stream.get_final_message()
        _check(message)
        return message

    def research(
        self,
        system: list[dict],
        prompt: str,
        on_text: Callable[[str], None],
        on_tool: Callable[[str], None],
    ) -> str:
        """Run web research, resuming if a long server-tool turn pauses."""
        messages: list[dict] = [{"role": "user", "content": prompt}]
        chunks: list[str] = []
        for _ in range(MAX_PAUSE_RESUMES + 1):
            with self.client.beta.messages.stream(
                max_tokens=64000,
                system=system,
                messages=messages,
                tools=RESEARCH_TOOLS,
                **self._common("high"),
            ) as stream:
                for event in stream:
                    if event.type == "content_block_start" and event.content_block.type == "server_tool_use":
                        on_tool(event.content_block.name)
                    elif event.type == "content_block_delta" and event.delta.type == "text_delta":
                        on_text(event.delta.text)
                message = stream.get_final_message()
            _check(message)
            chunks.append(_text(message))
            if message.stop_reason != "pause_turn":
                break
            # Paused mid-turn: send the partial assistant turn back to resume it.
            messages = messages + [{"role": "assistant", "content": message.content}]
        return "".join(chunks).strip()

    def scorecard(self, system: list[dict], transcript: str) -> Scorecard:
        message = self.client.beta.messages.parse(
            max_tokens=16000,
            system=system,
            messages=[{"role": "user", "content": transcript}],
            output_format=Scorecard,
            **self._common("high"),
        )
        _check(message)
        if message.parsed_output is None:
            raise RuntimeError("The grader did not return a scorecard.")
        return normalize(message.parsed_output)

    def score_jobs(self, system: list[dict], jobs_text: str) -> list[JobFit]:
        message = self.client.beta.messages.parse(
            max_tokens=16000,
            system=system,
            messages=[{"role": "user", "content": jobs_text}],
            output_format=JobFitBatch,
            **self._common("medium"),
        )
        _check(message)
        if message.parsed_output is None:
            raise RuntimeError("The scorer did not return results.")
        return message.parsed_output.results
