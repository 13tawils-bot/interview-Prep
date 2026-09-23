# Interview Prep: an elite BD interview coach

A terminal agent, powered by Claude, that prepares you for **business development,
partnerships, and strategic sales** interviews at a specific company. It researches
the company, turns your resume into a story bank, runs live mock interviews with
realistic interviewers, and grades you the way a hiring committee would. It keeps
track of your weak spots and targets them in the next session.

## Setup

```bash
pip install -e .
export ANTHROPIC_API_KEY=sk-ant-...     # or: ant auth login
```

## Workflow

```bash
# 1. Point it at a role (resume/JD can be .txt, .md, or .pdf)
prep init --company "Stripe" --role "Partnerships Manager, Platforms" \
          --jd jd.txt --resume resume.pdf --notes examples/notes_template.md

# 2. Research the company on the web → prep_data/<profile>/dossier.md
prep research

# 3. Tailored prep brief → brief.md
#    what they're really hiring for, 60-sec pitch, story bank with the numbers
#    you need ready, gaps, likely questions, 30-60-90 plan, questions to ask
prep brief

# 4. Live mock interview, then a scorecard
prep mock                                    # realistic mixed loop with the hiring manager
prep mock --mode deal --persona skeptic      # get a deal torn apart by a bar-raiser
prep mock --mode negotiation --persona executive

# 5. See your trend and what to drill next
prep progress
prep show last          # latest scorecard; also: show brief, show dossier
```

During a mock, press Enter on an empty line to submit an answer. Commands:
`/hint` (one line of coaching, then back in character), `/skip`, `/end` (finish and
get scored), `/quit` (discard the session).

### Mock modes

| Mode | What happens |
|---|---|
| `mixed` | Full realistic loop: opener, behavioral, a deal deep-dive, a strategic question |
| `behavioral` | BD competencies from the JD, probing for numbers and ownership |
| `deal` | Takes your best deal on the resume apart, then a lost deal |
| `pitch` | You pitch a partnership; the interviewer plays a busy, skeptical partner exec |
| `negotiation` | Role-play with a counterpart holding hidden priorities and a walk-away point |
| `case` | BD case: partner prioritization, market entry, build/buy/partner, sizing |
| `plan` | Defend your 30-60-90 day and pipeline plan |

Interviewer personas: `recruiter`, `hiring_manager`, `executive`, `peer`, `skeptic`.

### Scoring

Each mock is scored 1-5 on eight BD dimensions: **commercial impact, deal craft,
strategic thinking, relationship & influence, structure & clarity, company & market
fluency, executive presence, handling pushback**. You also get an overall 1-10
score, a hire signal, and evidence quoted from your answers. For each question there
is a rewritten stronger answer in your own voice, plus drills for the next 48
hours. Later mocks automatically target your three weakest recent dimensions (turn
this off with `--no-adapt`).

## Data and privacy

Everything is stored locally under `prep_data/` (override with `PREP_HOME`), which is
git-ignored. Your resume, JD, and transcripts are sent to the Anthropic API only when
you run a command.

## Configuration

| Env var | Default | |
|---|---|---|
| `PREP_MODEL` | `claude-opus-5` | Model used for all calls |
| `PREP_HOME` | `./prep_data` | Where profiles and sessions are stored |

## Development

```bash
pip install -e '.[dev]'
pytest
```

The code is laid out as follows: `prompts.py` holds all coaching and interviewer
prompts, `interview.py` is the mock loop, `llm.py` wraps the API, `scoring.py`
defines the scorecard schema and progress math, and `cli.py` provides the commands.
