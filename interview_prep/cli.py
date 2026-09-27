"""Command-line interface: `prep <command>`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import anthropic
from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table

from . import jobs as jobsmod
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
    job_fit_system,
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


# --- jobs -------------------------------------------------------------------

FIT_STYLE = {"strong": "[green]strong[/]", "stretch": "[yellow]stretch[/]", "skip": "[dim]skip[/]"}


def _split(value: str | None, default: list[str]) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()] if value else default


def cmd_jobs_search(args) -> None:
    titles = _split(args.titles, jobsmod.DEFAULT_TITLES)
    locations = _split(args.locations, jobsmod.DEFAULT_LOCATIONS)
    sources = ["ats", "linkedin"] if args.source == "both" else [args.source]
    console.print(f"[dim]Titles: {', '.join(titles)}\nLocations: {', '.join(locations)} · last {args.time_frame}[/]")

    fetched: list[dict] = []
    quotas: dict[str, dict] = {}
    for source in sources:
        name = jobsmod.SOURCES[source]["name"]
        with console.status(f"Searching {name}…"):
            try:
                result = jobsmod.search(titles, locations, args.time_frame, args.limit, args.offset, source)
            except jobsmod.JobsAPIError as e:
                if len(sources) == 1:
                    raise
                console.print(f"[yellow]{e} Continuing with the other source.[/]")
                continue
        fetched += result.jobs
        q = quotas[source] = result.quota
        console.print(
            f"{name}: {len(result.jobs)} fetched"
            + (
                f" [dim](quota left: {q.get('requests_remaining', '?')}/{q.get('requests_limit', '?')} requests, "
                f"{q.get('jobs_remaining', '?')}/{q.get('jobs_limit', '?')} jobs)[/]"
                if q
                else ""
            )
        )

    # ATS results first, so a role on both keeps the company-site version.
    report = jobsmod.JobStore().merge(fetched)
    console.print(
        f"[green]{len(report.added)} new[/] · {report.duplicates} duplicates or already saved · "
        + (", ".join(f"{n} dropped ({why})" for why, n in report.dropped.items()) or "0 dropped")
    )
    if args.json:
        added = [{**j, "dedupe_key": jobsmod.dedupe_key(j)} for j in report.added]
        Path(args.json).write_text(
            json.dumps({"quota": quotas, "dropped": report.dropped, "jobs": added}, indent=2)
        )
        console.print(f"Wrote {len(added)} new roles to {args.json}")
    if report.added:
        _jobs_table(sorted(report.added, key=lambda j: -j["quick_score"]), title="New roles")
        console.print("Next: [bold]prep jobs score[/] to rate them against your CV.")


def _jobs_table(rows: list[dict], title: str) -> None:
    table = Table(title=title, show_lines=False)
    for col in ("ID", "Fit", "Role", "Company", "Where", "Posted", "Status"):
        table.add_column(col, overflow="fold")
    for j in rows:
        company = j["organization"] + (" [magenta]AI[/]" if j.get("is_ai") else "")
        where = ", ".join(loc.split(",")[0] for loc in j.get("locations", [])[:2])
        if j.get("work_arrangement"):
            where += f" ({j['work_arrangement']})"
        table.add_row(
            j["id"],
            FIT_STYLE.get(j.get("fit"), f"[dim]~{j.get('quick_score', 0)}[/]"),
            j["title"],
            company,
            where,
            j.get("date_posted", ""),
            j.get("status", "new"),
        )
    console.print(table)


def cmd_jobs_list(args) -> None:
    rows = jobsmod.ranked(jobsmod.JobStore().load())
    if args.fit:
        rows = [j for j in rows if j.get("fit") == args.fit]
    if args.status:
        rows = [j for j in rows if j.get("status") == args.status]
    elif not args.all:
        rows = [
            j
            for j in rows
            if j.get("in_scope", True) and j.get("status") not in ("skipped", "rejected") and j.get("fit") != "skip"
        ]
    if not rows:
        console.print("No saved jobs match. Run: prep jobs search")
        return
    _jobs_table(rows[: args.limit], title=f"Saved roles ({len(rows)})")


def cmd_jobs_score(args) -> None:
    resume = store.load_default_resume()
    if not resume:
        raise SystemExit("No saved resume. Run: prep resume <file>")
    js = jobsmod.JobStore()
    todo = [
        j for j in jobsmod.ranked(js.load()) if j.get("in_scope", True) and (args.rescore or not j.get("fit"))
    ][: args.max]
    if not todo:
        console.print("Everything is already scored. Use --rescore to redo it.")
        return
    coach = Coach()
    system = job_fit_system(resume, store.load_preferences())
    scored = 0
    for i in range(0, len(todo), 10):
        batch = todo[i : i + 10]
        with console.status(f"Scoring roles {i + 1}-{i + len(batch)} of {len(todo)} against your CV…"):
            results = coach.score_jobs(system, "\n\n".join(jobsmod.job_for_scoring(j) for j in batch))
        ids = {j["id"] for j in batch}
        for r in results:
            if r.job_id in ids:
                js.update(r.job_id, fit=r.fit, fit_reason=r.reason, fit_gaps=r.gaps)
                scored += 1
    console.print(f"Scored {scored} roles.")
    cmd_jobs_list(argparse.Namespace(fit=None, status=None, all=False, limit=30))


def cmd_jobs_show(args) -> None:
    j = jobsmod.JobStore().get(args.id)
    funding = f"${j['funding_total']:,.0f} raised" if j.get("funding_total") else "funding unknown"
    lines = [
        f"# {j['title']} · {j['organization']}",
        "",
        f"**Fit:** {j.get('fit') or 'not scored'}" + (f" · {j['fit_reason']}" if j.get("fit_reason") else ""),
        f"**Gap to address:** {j['fit_gaps']}" if j.get("fit_gaps") else "",
        f"**Status:** {j.get('status', 'new')} · **Posted:** {j.get('date_posted')}",
        f"**Where:** {', '.join(j.get('locations', []))} ({j.get('work_arrangement') or 'n/a'})",
        f"**Company:** {j.get('industry') or 'n/a'} · {j.get('headcount') or '?'} staff · {funding}",
        f"**Experience asked:** {j.get('experience_level') or 'n/a'} years"
        + (f" · **Salary:** {j['salary']}" if j.get("salary") else ""),
        f"**Apply:** {j.get('url')}",
        "",
        f"**Requirements:** {j.get('requirements') or 'n/a'}",
        "",
        f"**Responsibilities:** {j.get('responsibilities') or 'n/a'}",
    ]
    console.print(Markdown("\n\n".join(line for line in lines if line)))


def cmd_jobs_status(args) -> None:
    jobsmod.JobStore().update(args.id, status=args.status)
    console.print(f"Marked {args.id} as [bold]{args.status}[/].")


def cmd_jobs_prep(args) -> None:
    js = jobsmod.JobStore()
    j = js.get(args.id)
    resume = store.load_default_resume()
    if not resume:
        raise SystemExit("No saved resume. Run: prep resume <file>")
    slug = store.slugify(j["organization"], j["title"])
    store.Profile(slug).save(
        {
            "company": j["organization"],
            "role": j["title"],
            "job_description": jobsmod.job_as_jd(j),
            "resume": resume,
            "notes": "",
        }
    )
    store.set_active(slug)
    if j.get("status") in (None, "new"):
        js.update(args.id, status="shortlisted")
    console.print(f"[green]Created profile[/] [bold]{slug}[/] from this job and made it active.")
    console.print("Next: [bold]prep research[/] → [bold]prep brief[/] → [bold]prep mock[/]")


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

    jobs = sub.add_parser("jobs", help="find and track roles (Active Jobs DB + LinkedIn via RapidAPI)")
    jsub = jobs.add_subparsers(dest="jobs_command", required=True)

    p = jsub.add_parser("search", help="one API request: fetch new roles and save them")
    p.add_argument("--titles", help=f"comma-separated (default: {', '.join(jobsmod.DEFAULT_TITLES)})")
    p.add_argument("--locations", help='comma-separated (default: "United Kingdom")')
    p.add_argument("--time-frame", default="7d", help="how far back: 1h, 24h, 7d (default 7d)")
    p.add_argument(
        "--source",
        choices=["both", "ats", "linkedin"],
        default="both",
        help="ats = company career sites (Active Jobs DB), linkedin = LinkedIn Job Search API; both = 2 requests",
    )
    p.add_argument("--limit", type=int, default=50, help="max jobs per source; counts against each API's monthly job quota")
    p.add_argument("--offset", type=int, default=0, help="skip this many results (for paging)")
    p.add_argument("--json", metavar="PATH", help="also write the new roles and quota as JSON (for automation)")
    p.set_defaults(func=cmd_jobs_search)

    p = jsub.add_parser("list", help="saved roles, best fit first")
    p.add_argument("--fit", choices=["strong", "stretch", "skip"])
    p.add_argument("--status", choices=jobsmod.STATUSES)
    p.add_argument("--all", action="store_true", help="include skipped and rejected roles")
    p.add_argument("--limit", type=int, default=30)
    p.set_defaults(func=cmd_jobs_list)

    p = jsub.add_parser("score", help="rate saved roles against your CV with Claude")
    p.add_argument("--max", type=int, default=40, help="max roles to score in this run")
    p.add_argument("--rescore", action="store_true")
    p.set_defaults(func=cmd_jobs_score)

    p = jsub.add_parser("show", help="details for one role")
    p.add_argument("id")
    p.set_defaults(func=cmd_jobs_show)

    p = jsub.add_parser("status", help="track where you are with a role")
    p.add_argument("id")
    p.add_argument("status", choices=jobsmod.STATUSES)
    p.set_defaults(func=cmd_jobs_status)

    p = jsub.add_parser("prep", help="turn a role into a prep profile (then research, brief, mock)")
    p.add_argument("id")
    p.set_defaults(func=cmd_jobs_prep)

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
    except jobsmod.JobsAPIError as e:
        console.print(f"[red]{e}[/]")
        sys.exit(1)
    except (FileNotFoundError, ValueError) as e:
        console.print(f"[red]{e}[/]")
        sys.exit(1)
