"""Job discovery: fetch roles from Active Jobs DB, filter, dedupe, and track them.

Active Jobs DB (by Fantastic.jobs, via RapidAPI) indexes jobs from company
career sites and ATSs and enriches them with AI and LinkedIn/Crunchbase fields.
The free plan is small (25 requests / 250 jobs a month), so every search is
one request and results are cached locally in prep_data/jobs/jobs.json.

Auth: requests send X-RapidAPI-Key from $RAPIDAPI_KEY when it is set. In a
Claude Code cloud environment with a RapidAPI credential, the header is
injected by the network proxy instead and the variable can be left unset.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from . import store

# Both APIs are by Fantastic.jobs and share the same query syntax and most fields.
SOURCES = {
    "ats": {
        "name": "Active Jobs DB",
        "host": "active-jobs-db.p.rapidapi.com",
        "path": "/active-ats",
        "extra": {"include_basic_organization_details": "true"},
    },
    "linkedin": {
        "name": "LinkedIn Job Search API",
        "host": "linkedin-job-search-api.p.rapidapi.com",
        "path": "/active-jb",
        "extra": {},
    },
}

DEFAULT_TITLES = [
    "Founding GTM",
    "Founding Sales",
    "Founding Account Executive",
    "GTM Lead",
    "Commercial Director",
    "VP Sales",
    "VP of Sales",
    "Head of Sales",
    "Regional Vice President",
    "Enterprise Account Executive",
    "Senior Account Executive",
    "Mid-Market Account Executive",
    "Account Executive",
    "Sales Director",
    "Director of Sales",
    "Business Development Director",
    "Country Manager",
    "General Manager",
    "Head of Growth",
    "Head of Partnerships",
    "Account Director",
    "Strategic Account Director",
    "Director of Enterprise Sales",
    "Regional Director",
    "Enterprise Sales Executive",
    "Head of Business Development",
]
DEFAULT_LOCATIONS = ["United Kingdom", "United Arab Emirates", "Saudi Arabia"]

# Titles that match a search term but aren't the kind of role we want.
EXCLUDE_TITLE = re.compile(
    r"\b(intern|internship|graduate|sdr|bdr|sales development|business development representative|"
    r"customer success|support|recruit|marketing manager|engineer|analyst|assistant|coordinator|"
    r"account manager|associate|"
    r"operations|revops|sales ops|delivery|contractor|junior|entry[- ]level|trainee|apprentice)\b",
    re.I,
)

TECH_INDUSTRY = re.compile(
    r"software|technology|internet|computer|information|it services|saas|fintech|artificial intelligence",
    re.I,
)
# Recruiters that list under their own name with a tech industry tag, so the checks above miss them.
KNOWN_RECRUITERS = re.compile(r"^(jumpstart|jack & jill|techtree|cygnify)\b", re.I)
# Crunchbase categories are reliable; free-text descriptions need stronger phrases,
# since most companies now mention AI somewhere.
AI_CATEGORY = re.compile(r"artificial intelligence|machine learning|generative ai|\bai\b", re.I)
AI_DESCRIPTION = re.compile(
    r"\b(ai[- ]native|ai[- ]powered|ai[- ]first|ai agents?|generative ai|genai|llms?|large language models?|"
    r"foundation models?|unified ai)\b",
    re.I,
)

STATUSES = ["new", "shortlisted", "applied", "interviewing", "offer", "rejected", "skipped"]


class JobsAPIError(RuntimeError):
    pass


# --- API ---------------------------------------------------------------------


def or_query(terms: list[str]) -> str:
    """Active Jobs DB search syntax: quoted phrases joined with OR."""
    return " OR ".join(f'"{t}"' for t in terms)


@dataclass
class SearchResult:
    jobs: list[dict]
    quota: dict = field(default_factory=dict)


def search(
    titles: list[str],
    locations: list[str],
    time_frame: str = "7d",
    limit: int = 50,
    offset: int = 0,
    source: str = "ats",
    opener=urllib.request.urlopen,
) -> SearchResult:
    """One request to the source's API. Costs 1 request and up to `limit` jobs of that API's quota."""
    cfg = SOURCES[source]
    params = {
        "title": or_query(titles),
        "location": or_query(locations),
        "time_frame": time_frame,
        "limit": str(limit),
        "offset": str(offset),
        "description_format": "text",
        **cfg["extra"],
    }
    req = urllib.request.Request(f"https://{cfg['host']}{cfg['path']}?{urllib.parse.urlencode(params)}")
    req.add_header("X-RapidAPI-Host", cfg["host"])
    if os.environ.get("RAPIDAPI_KEY"):
        req.add_header("X-RapidAPI-Key", os.environ["RAPIDAPI_KEY"])
    try:
        with opener(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            headers = resp.headers
    except urllib.error.HTTPError as e:
        try:
            message = json.loads(e.read().decode("utf-8")).get("message", "")
        except (ValueError, AttributeError):
            message = ""
        raise JobsAPIError(f"{cfg['name']}: {_explain(e.code, message)}") from e
    except urllib.error.URLError as e:
        raise JobsAPIError(f"Could not reach {cfg['host']}: {e.reason}") from e
    if not isinstance(body, list):
        raise JobsAPIError(f"Unexpected response from {cfg['name']}: {str(body)[:200]}")
    for job in body:
        job["_source"] = source
    return SearchResult(jobs=body, quota=_quota(headers))


def _explain(status: int, message: str) -> str:
    if status == 403 and "not subscribed" in message.lower():
        return (
            "RapidAPI says this key isn't subscribed to this API. Check the key is the one "
            "your RapidAPI app uses, and that the app is subscribed to a plan."
        )
    if status == 429:
        return "RapidAPI rate limit or monthly quota reached. Check your plan's limits."
    if status in (401, 403):
        return f"RapidAPI rejected the request ({status}): {message or 'check RAPIDAPI_KEY'}"
    return f"Active Jobs DB returned {status}: {message}"


def _quota(headers) -> dict:
    out = {}
    for name, key in [
        ("X-Ratelimit-Requests-Remaining", "requests_remaining"),
        ("X-Ratelimit-Requests-Limit", "requests_limit"),
        ("X-Ratelimit-Jobs-Remaining", "jobs_remaining"),
        ("X-Ratelimit-Jobs-Limit", "jobs_limit"),
    ]:
        value = headers.get(name) if headers is not None else None
        if value is not None and str(value).isdigit():
            out[key] = int(value)
    return out


# --- Normalizing and filtering ------------------------------------------------


def normalize(raw: dict) -> dict:
    """Keep the fields we use; the raw record is large."""
    locations = raw.get("locations_derived") or raw.get("locations_alt") or []
    return {
        "id": str(raw.get("id")),
        "source": raw.get("_source", "ats"),
        "seniority": raw.get("seniority"),
        "title": raw.get("title") or "",
        "organization": raw.get("organization") or raw.get("org_linkedin_name") or "",
        "url": raw.get("url") or "",
        "date_posted": (raw.get("date_posted") or "")[:10],
        "locations": locations,
        "work_arrangement": raw.get("ai_work_arrangement"),
        "experience_level": raw.get("ai_experience_level"),
        "requirements": raw.get("ai_requirements_summary"),
        "responsibilities": raw.get("ai_core_responsibilities"),
        "key_skills": raw.get("ai_key_skills") or [],
        "salary": _salary(raw),
        "visa_sponsorship": raw.get("ai_visa_sponsorship"),
        "industry": raw.get("org_linkedin_industry"),
        "headcount": raw.get("org_linkedin_headcount"),
        "company_size": raw.get("org_linkedin_size"),
        "funding_total": raw.get("org_crunchbase_total_investment"),
        "categories": raw.get("org_crunchbase_categories") or [],
        "taxonomies": raw.get("ai_taxonomies_a") or [],
        "company_description": raw.get("org_linkedin_description") or raw.get("org_linkedin_slogan") or "",
        "is_agency": bool(raw.get("org_linkedin_recruitment_agency_derived")),
        "description": raw.get("description_text") or "",
    }


def _salary(raw: dict) -> str | None:
    lo, hi = raw.get("ai_salary_min_value"), raw.get("ai_salary_max_value")
    value, cur = raw.get("ai_salary_value"), raw.get("ai_salary_currency") or ""
    if lo and hi:
        return f"{cur} {lo:,.0f}-{hi:,.0f}".strip()
    if value:
        return f"{cur} {value:,.0f}".strip()
    return None


def is_tech(job: dict) -> bool:
    text = " ".join([job.get("industry") or "", *job.get("categories", [])])
    return bool(TECH_INDUSTRY.search(text)) or bool(
        {"Technology", "Software"} & set(job.get("taxonomies", []))
    )


def is_ai(job: dict) -> bool:
    if AI_CATEGORY.search(" ".join(job.get("categories", []))):
        return True
    return bool(AI_DESCRIPTION.search(job.get("company_description") or ""))


def is_agency(job: dict) -> bool:
    """The agency flag misfires on some software companies, so check the industry too."""
    industry = (job.get("industry") or "").lower()
    if "staffing" in industry or "recruit" in industry:
        return True
    if KNOWN_RECRUITERS.search(job.get("organization") or ""):
        return True
    return job.get("is_agency", False) and not TECH_INDUSTRY.search(industry)


def keep(job: dict) -> tuple[bool, str]:
    """Local filter; returns (keep?, reason if dropped)."""
    if is_agency(job):
        return False, "recruitment agency"
    if EXCLUDE_TITLE.search(job["title"]):
        return False, "title out of scope"
    if not is_tech(job):
        return False, "not a tech company"
    return True, ""


def quick_score(job: dict) -> int:
    """Free, rule-based ranking (0-100) used before any Claude scoring."""
    score = 50
    title = job["title"].lower()
    if any(w in title for w in ("founding", "first", "lead", "head of")):
        score += 15
    if "startup" in title or "digital native" in title:
        score += 10
    if is_ai(job):
        score += 15
    level = job.get("experience_level") or ""
    if level in ("2-5", "5-10"):
        score += 10
    elif level == "10+":
        score -= 20
    elif level == "0-2" or job.get("seniority") in ("Entry level", "Internship"):
        score -= 10
    headcount = job.get("headcount") or 0
    if 10 <= headcount <= 500:
        score += 5
    if any("london" in loc.lower() for loc in job.get("locations", [])):
        score += 5
    return max(0, min(100, score))


def dedupe_key(job: dict) -> str:
    """Catch the same role posted twice (reposts, several ATS entries, later LinkedIn)."""
    title = re.sub(r"[^a-z0-9]+", " ", job["title"].lower()).strip()
    org = re.sub(r"[^a-z0-9]+", "", job["organization"].lower())
    return f"{org}|{title}"


# --- Local store ----------------------------------------------------------------


class JobStore:
    def __init__(self, root: Path | None = None):
        self.path = (root or store.home()) / "jobs" / "jobs.json"

    def load(self) -> dict[str, dict]:
        if not self.path.exists():
            return {}
        jobs = json.loads(self.path.read_text())
        # Recompute local signals so rule changes apply to jobs saved earlier.
        for job in jobs.values():
            job["is_ai"] = is_ai(job)
            job["quick_score"] = quick_score(job)
            job["in_scope"] = keep(job)[0]
        return jobs

    def save(self, jobs: dict[str, dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(jobs, indent=2))

    def merge(self, raw_jobs: list[dict]) -> "MergeReport":
        jobs = self.load()
        seen_keys = {dedupe_key(j): jid for jid, j in jobs.items()}
        report = MergeReport()
        now = datetime.now().isoformat(timespec="seconds")
        for raw in raw_jobs:
            job = normalize(raw)
            ok, reason = keep(job)
            if not ok:
                report.dropped[reason] = report.dropped.get(reason, 0) + 1
                continue
            if job["id"] in jobs or dedupe_key(job) in seen_keys:
                report.duplicates += 1
                continue
            job.update(first_seen=now, status="new", quick_score=quick_score(job), is_ai=is_ai(job))
            jobs[job["id"]] = job
            seen_keys[dedupe_key(job)] = job["id"]
            report.added.append(job)
        self.save(jobs)
        return report

    def get(self, job_id: str) -> dict:
        jobs = self.load()
        if job_id not in jobs:
            raise ValueError(f"No saved job with id {job_id}. See: prep jobs list --all")
        return jobs[job_id]

    def update(self, job_id: str, **fields) -> dict:
        jobs = self.load()
        if job_id not in jobs:
            raise ValueError(f"No saved job with id {job_id}. See: prep jobs list --all")
        jobs[job_id].update(fields)
        self.save(jobs)
        return jobs[job_id]


@dataclass
class MergeReport:
    added: list[dict] = field(default_factory=list)
    duplicates: int = 0
    dropped: dict[str, int] = field(default_factory=dict)


def ranked(jobs: dict[str, dict]) -> list[dict]:
    """Claude fit first (strong, stretch, unscored, skip), then quick score, newest first."""
    fit_order = {"strong": 0, "stretch": 1, None: 2, "skip": 3}
    return sorted(
        jobs.values(),
        key=lambda j: (fit_order.get(j.get("fit"), 2), -j.get("quick_score", 0), j.get("date_posted", "")),
    )


def job_as_jd(job: dict) -> str:
    """Text used as the job description when turning a job into a prep profile."""
    parts = [
        f"{job['title']} at {job['organization']}",
        f"Location: {', '.join(job.get('locations', []))} ({job.get('work_arrangement') or 'n/a'})",
        f"URL: {job.get('url', '')}",
        "",
        job.get("description") or job.get("responsibilities") or "",
    ]
    return "\n".join(parts).strip()


def job_for_scoring(job: dict) -> str:
    funding = f"${job['funding_total']:,.0f} raised" if job.get("funding_total") else "funding unknown"
    return (
        f"<job id=\"{job['id']}\">\n"
        f"Title: {job['title']}\nCompany: {job['organization']} ({job.get('industry') or 'n/a'}; "
        f"{job.get('headcount') or '?'} staff; {funding})\n"
        f"Company description: {(job.get('company_description') or '')[:400]}\n"
        f"Location: {', '.join(job.get('locations', []))}; {job.get('work_arrangement') or 'n/a'}\n"
        f"Experience level: {job.get('experience_level') or 'n/a'}\n"
        f"Requirements: {job.get('requirements') or 'n/a'}\n"
        f"Responsibilities: {job.get('responsibilities') or 'n/a'}\n"
        f"</job>"
    )
