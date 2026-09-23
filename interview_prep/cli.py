"""Command-line interface: `prep <command>`."""

from __future__ import annotations

import argparse
import sys

import anthropic
from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table

from . import store
from .documents import read_text_input
from .interview import run_mock, score_mock
from .llm import Coach, RefusalError
from .prompts import (
    BD_DIMENSIONS,
    BRIEF_INSTRUCTIONS,
    MODES,
    PERSONAS,
    RESEARCH_INSTRUCTIONS,
    context_system_blocks,
)
from .scoring import dimension_averages, render_markdown, weakest_dimensions

console = Console()


def _out(text: str) -> None:
    sys.stdout.write(text)
    sys.stdout.flush()


def _profile(args) -> store.Profile:
    slug = getattr(args, "profile", None) or store.get_active()
    if not slug:
        raise SystemExit("No profile yet. Start with: prep init --company ... --role ... --jd ...")
    profile = store.Profile(slug)
    if not profile.exists:
        raise SystemExit(f"Profile '{slug}' not found. See: prep list")
    return profile


# --- commands ---------------------------------------------------------------


def cmd_init(args) -> None:
    if args.resume:
        resume = read_text_input(args.resume)
    else:
        resume = store.load_default_resume()
        if not resume:
            raise SystemExit("No --resume given and no saved resume. Run: prep resume <file>")
    data = {
        "company": args.company,
        "role": args.role,
        "job_description": read_text_input(args.jd),
        "resume": resume,
        "notes": read_text_input(args.notes) if args.notes else "",
    }
    slug = args.name or store.slugify(args.company, args.role)
    profile = store.Profile(slug)
    profile.save(data)
    store.set_active(slug)
    console.print(f"[green]Saved profile[/] [bold]{slug}[/] and made it active.")
    console.print("Next: [bold]prep research[/] → [bold]prep brief[/] → [bold]prep mock[/]")


def cmd_resume(args) -> None:
    if args.file:
        path = store.save_default_resume(read_text_input(args.file))
        console.print(f"[green]Saved your resume[/] to {path}. `prep init` will use it by default.")
        return
    text = store.load_default_resume()
    if not text:
        raise SystemExit("No saved resume yet. Run: prep resume <file>")
    console.print(text)


def cmd_list(args) -> None:
    active = store.get_active()
    slugs = store.list_profiles()
    if not slugs:
        console.print("No profiles yet. Run prep init.")
    for slug in slugs:
        marker = "[green]*[/]" if slug == active else " "
        console.print(f"{marker} {slug}")


def cmd_use(args) -> None:
    if not store.Profile(args.slug).exists:
        raise SystemExit(f"Profile '{args.slug}' not found. See: prep list")
    store.set_active(args.slug)
    console.print(f"Active profile: [bold]{args.slug}[/]")


def cmd_research(args) -> None:
    profile = _profile(args)
    data = profile.load()
    system = context_system_blocks(data, None, RESEARCH_INSTRUCTIONS)
    console.rule(f"Researching {data['company']}")

    def on_tool(name: str) -> None:
        label = "searching the web" if name == "web_search" else "reading a source"
        console.print(f"\n[dim]· {label}…[/]")

    dossier = Coach().research(
        system,
        f"Build the company dossier for {data['company']} ({data['role']}).",
        on_text=_out,
        on_tool=on_tool,
    )
    path = profile.write_doc("dossier.md", dossier + "\n")
    console.print(f"\n\n[green]Saved[/] {path}")


def cmd_brief(args) -> None:
    profile = _profile(args)
    data = profile.load()
    dossier = profile.read_doc("dossier.md")
    if not dossier:
        console.print("[yellow]No company dossier yet; the brief will be stronger after `prep research`.[/]")
    system = context_system_blocks(data, dossier, BRIEF_INSTRUCTIONS)
    console.rule("Writing your prep brief")
    message = Coach().stream_turn(
        system,
        [{"role": "user", "content": "Write my prep brief."}],
        on_text=_out,
        effort="high",
    )
    text = "".join(b.text for b in message.content if b.type == "text")
    path = profile.write_doc("brief.md", text + "\n")
    console.print(f"\n\n[green]Saved[/] {path}")


def _read_answer() -> str | None:
    """Multi-line answer; a blank line submits. Slash commands submit immediately."""
    lines: list[str] = []
    try:
        while True:
            line = input("  " if lines else "\nyou › ")
            if not lines and line.strip().startswith("/"):
                return line.strip()
            if not line.strip():
                if lines:
                    return "\n".join(lines)
                continue
            lines.append(line)
    except EOFError:
        return "\n".join(lines) if lines else None


def cmd_mock(args) -> None:
    profile = _profile(args)
    data = profile.load()
    dossier = profile.read_doc("dossier.md")
    focus = [] if args.no_adapt else weakest_dimensions(profile.scorecards())

    console.rule(f"Mock interview · {args.mode} · {args.persona.replace('_', ' ')}")
    console.print(
        "[dim]Answer out loud first, then type it. Press Enter on an empty line to submit.\n"
        "Commands: /hint  /skip  /end (finish and get scored)  /quit (discard)[/]"
    )
    if focus:
        console.print(f"[dim]Targeting your weakest areas: {', '.join(focus)}[/]")

    def on_turn_start(speaker: str) -> None:
        if speaker == "interviewer":
            console.print("\n[bold cyan]interviewer ›[/] ", end="")

    coach = Coach()
    result = run_mock(
        coach,
        data,
        dossier,
        mode=args.mode,
        persona=args.persona,
        num_questions=args.questions,
        focus_areas=focus,
        read_answer=_read_answer,
        write=_out,
        on_turn_start=on_turn_start,
    )
    console.print()
    if result.aborted:
        console.print("[yellow]Session discarded.[/]")
        return
    if args.no_score or not any(t["speaker"] == "candidate" for t in result.transcript):
        path = profile.save_session(result.to_record(), None)
        console.print(f"[green]Transcript saved[/] {path}")
        return

    with console.status("Grading your interview like a hiring committee…"):
        result.scorecard = score_mock(coach, data, dossier, result)
    title = f"{data['company']} · {data['role']} · {args.mode} mock"
    md = render_markdown(result.scorecard, title)
    path = profile.save_session(result.to_record(), md)
    console.print(Markdown(md))
    console.print(f"\n[green]Saved[/] {path.with_suffix('.md')}")


def cmd_progress(args) -> None:
    profile = _profile(args)
    sessions = [s for s in profile.sessions() if s.get("scorecard")]
    if not sessions:
        console.print("No scored mocks yet. Run: prep mock")
        return
    cards = [s["scorecard"] for s in sessions]

    history = Table(title="Mock history")
    for col in ("Date", "Mode", "Interviewer", "Overall", "Signal"):
        history.add_column(col)
    for s in sessions:
        c = s["scorecard"]
        history.add_row(
            s["started_at"].replace("T", " ")[:16],
            s["mode"],
            s["persona"].replace("_", " "),
            f"{c['overall']}/10",
            c["hire_signal"].replace("_", " "),
        )
    console.print(history)

    all_avg = dimension_averages(cards)
    recent_avg = dimension_averages(cards, last_n=3)
    dims = Table(title="Dimensions (1-5)")
    dims.add_column("Dimension")
    dims.add_column("All-time", justify="right")
    dims.add_column("Last 3", justify="right")
    for name in BD_DIMENSIONS:
        if name in all_avg:
            dims.add_row(name, f"{all_avg[name]:.1f}", f"{recent_avg.get(name, 0):.1f}")
    console.print(dims)

    weak = weakest_dimensions(cards)
    console.print(f"\n[bold]Focus next:[/] {', '.join(weak)}")
    drills = cards[-1].get("drills", [])
    if drills:
        console.print("[bold]Open drills from your last mock:[/]")
        for d in drills:
            console.print(f"  • {d}")


def cmd_show(args) -> None:
    profile = _profile(args)
    if args.what == "last":
        mds = sorted(profile.sessions_dir.glob("*.md")) if profile.sessions_dir.exists() else []
        text = mds[-1].read_text() if mds else None
    else:
        text = profile.read_doc(f"{args.what}.md")
    if not text:
        raise SystemExit(f"Nothing to show yet for '{args.what}'.")
    console.print(Markdown(text))


# --- entry point ------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="prep",
        description="Elite interview coach for business development and partnerships roles.",
    )
    parser.add_argument("--profile", help="profile slug to use instead of the active one")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="set up a target role: company, JD, resume")
    p.add_argument("--company", required=True)
    p.add_argument("--role", required=True, help='e.g. "Senior Manager, Strategic Partnerships"')
    p.add_argument("--jd", required=True, help="job description file (.txt/.md/.pdf) or - for stdin")
    p.add_argument("--resume", help="resume file (.txt/.md/.pdf); defaults to the one saved with `prep resume`")
    p.add_argument("--notes", help="optional file with extra context: deal numbers, stories, interview format")
    p.add_argument("--name", help="custom profile slug")
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("resume", help="save your resume once so every profile can use it")
    p.add_argument("file", nargs="?", help="resume file (.txt/.md/.pdf); omit to print the saved one")
    p.set_defaults(func=cmd_resume)

    sub.add_parser("list", help="list profiles").set_defaults(func=cmd_list)

    p = sub.add_parser("use", help="switch the active profile")
    p.add_argument("slug")
    p.set_defaults(func=cmd_use)

    sub.add_parser("research", help="research the company on the web → dossier.md").set_defaults(
        func=cmd_research
    )
    sub.add_parser("brief", help="write a tailored prep brief → brief.md").set_defaults(func=cmd_brief)

    p = sub.add_parser("mock", help="run a live mock interview, then get scored")
    p.add_argument("--mode", choices=list(MODES), default="mixed")
    p.add_argument("--persona", choices=list(PERSONAS), default="hiring_manager")
    p.add_argument("--questions", type=int, default=5, help="number of main questions (default 5)")
    p.add_argument("--no-adapt", action="store_true", help="don't target weak areas from past mocks")
    p.add_argument("--no-score", action="store_true", help="save the transcript without grading")
    p.set_defaults(func=cmd_mock)

    sub.add_parser("progress", help="scores over time and what to work on").set_defaults(func=cmd_progress)

    p = sub.add_parser("show", help="print the dossier, brief, or last scorecard")
    p.add_argument("what", choices=["dossier", "brief", "last"])
    p.set_defaults(func=cmd_show)
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    try:
        args.func(args)
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted.[/]")
        sys.exit(130)
    except RefusalError as e:
        console.print(f"\n[red]The model declined this request:[/] {e}")
        sys.exit(1)
    except anthropic.AuthenticationError:
        console.print("\n[red]Authentication failed.[/] Set ANTHROPIC_API_KEY or run `ant auth login`.")
        sys.exit(1)
    except anthropic.RateLimitError:
        console.print("\n[red]Rate limited by the API.[/] Wait a minute and try again.")
        sys.exit(1)
    except anthropic.APIStatusError as e:
        console.print(f"\n[red]API error {e.status_code}:[/] {e.message}")
        sys.exit(1)
    except anthropic.APIConnectionError:
        console.print("\n[red]Could not reach the Anthropic API.[/] Check your network connection.")
        sys.exit(1)
    except (FileNotFoundError, ValueError) as e:
        console.print(f"[red]{e}[/]")
        sys.exit(1)
