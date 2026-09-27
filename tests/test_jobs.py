import io
import json
import urllib.error
import urllib.parse
from email.message import Message

import pytest

from interview_prep import jobs


def raw_job(id=1, title="Account Executive", org="Acme AI", **extra):
    job = {
        "id": id,
        "title": title,
        "organization": org,
        "url": f"https://jobs.example.com/{id}",
        "date_posted": "2026-09-27T10:04:38",
        "locations_derived": ["London, England, United Kingdom"],
        "ai_work_arrangement": "Hybrid",
        "ai_experience_level": "2-5",
        "ai_requirements_summary": "3+ years of B2B SaaS sales.",
        "org_linkedin_industry": "Software Development",
        "org_linkedin_headcount": 120,
        "org_crunchbase_total_investment": 20_000_000,
        "org_crunchbase_categories": ["Artificial Intelligence (AI)", "SaaS"],
        "org_linkedin_description": "We build AI agents for customer operations.",
        "org_linkedin_recruitment_agency_derived": False,
        "ai_taxonomies_a": ["Sales", "Technology"],
        "description_text": "Own the full sales cycle.",
    }
    job.update(extra)
    return job


class FakeResponse(io.BytesIO):
    def __init__(self, body, headers=None):
        super().__init__(json.dumps(body).encode())
        self.headers = Message()
        for k, v in (headers or {}).items():
            self.headers[k] = v

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_search_builds_query_and_reads_quota(monkeypatch):
    monkeypatch.delenv("RAPIDAPI_KEY", raising=False)
    seen = {}

    def opener(req, timeout):
        seen["url"] = req.full_url
        seen["headers"] = dict(req.header_items())
        return FakeResponse(
            [raw_job()],
            {"X-Ratelimit-Requests-Remaining": "22", "X-Ratelimit-Jobs-Remaining": "200"},
        )

    result = jobs.search(["Account Executive", "Founding GTM"], ["United Kingdom"], "24h", 10, opener=opener)
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(seen["url"]).query)
    assert query["title"] == ['"Account Executive" OR "Founding GTM"']
    assert query["location"] == ['"United Kingdom"']
    assert query["time_frame"] == ["24h"] and query["limit"] == ["10"]
    # No key in env: rely on the environment's credential injection.
    assert "X-rapidapi-key" not in seen["headers"]
    assert result.quota == {"requests_remaining": 22, "jobs_remaining": 200}


def test_search_linkedin_source(monkeypatch):
    monkeypatch.delenv("RAPIDAPI_KEY", raising=False)
    seen = {}

    def opener(req, timeout):
        seen["url"] = req.full_url
        seen["host"] = req.get_header("X-rapidapi-host")
        return FakeResponse([raw_job(seniority="Mid-Senior level")])

    result = jobs.search(["AE"], ["UK"], source="linkedin", opener=opener)
    assert seen["url"].startswith("https://linkedin-job-search-api.p.rapidapi.com/active-jb?")
    assert seen["host"] == "linkedin-job-search-api.p.rapidapi.com"
    # LinkedIn rejects this parameter with a 400.
    assert "include_basic_organization_details" not in seen["url"]
    assert jobs.normalize(result.jobs[0])["source"] == "linkedin"


def test_search_sends_key_from_env(monkeypatch):
    monkeypatch.setenv("RAPIDAPI_KEY", "k")
    seen = {}

    def opener(req, timeout):
        seen["headers"] = dict(req.header_items())
        return FakeResponse([])

    jobs.search(["AE"], ["UK"], opener=opener)
    assert seen["headers"]["X-rapidapi-key"] == "k"


def test_search_explains_not_subscribed():
    def opener(req, timeout):
        body = io.BytesIO(json.dumps({"message": "You are not subscribed to this API."}).encode())
        raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", Message(), body)

    with pytest.raises(jobs.JobsAPIError, match="isn't subscribed"):
        jobs.search(["AE"], ["UK"], opener=opener)


def test_filters():
    keep = jobs.keep
    assert keep(jobs.normalize(raw_job()))[0]
    agency = raw_job(org_linkedin_industry="Staffing and Recruiting")
    assert keep(jobs.normalize(agency)) == (False, "recruitment agency")
    # The agency flag misfires on some software companies; trust the industry.
    assert keep(jobs.normalize(raw_job(org_linkedin_recruitment_agency_derived=True)))[0]
    assert keep(jobs.normalize(raw_job(title="Junior Account Executive")))[1] == "title out of scope"
    assert keep(jobs.normalize(raw_job(title="SDR, UK")))[1] == "title out of scope"
    assert keep(jobs.normalize(raw_job(title="Sales Engineer")))[1] == "title out of scope"
    not_tech = raw_job(
        org_linkedin_industry="Hospitality", org_crunchbase_categories=[], ai_taxonomies_a=["Sales"]
    )
    assert keep(jobs.normalize(not_tech))[1] == "not a tech company"


def test_quick_score_prefers_founding_ai_roles():
    founding = jobs.normalize(raw_job(title="Founding Account Executive"))
    senior = jobs.normalize(
        raw_job(
            title="Enterprise Account Executive",
            ai_experience_level="10+",
            org_linkedin_description="Payroll software",
            org_crunchbase_categories=["SaaS"],
        )
    )
    assert jobs.is_ai(founding) and not jobs.is_ai(senior)
    assert jobs.quick_score(founding) > jobs.quick_score(senior)


def test_merge_dedupes_and_tracks(tmp_path):
    store = jobs.JobStore(root=tmp_path)
    report = store.merge([raw_job(1), raw_job(2, title="account executive"), raw_job(3, title="Intern")])
    assert [j["id"] for j in report.added] == ["1"]
    assert report.duplicates == 1  # same company + title, different id
    assert report.dropped == {"title out of scope": 1}

    again = store.merge([raw_job(1), raw_job(4, title="Founding GTM Lead")])
    assert again.duplicates == 1 and [j["id"] for j in again.added] == ["4"]

    store.update("4", status="applied", fit="strong")
    ranked = jobs.ranked(store.load())
    assert ranked[0]["id"] == "4"
    assert "Founding GTM Lead at Acme AI" in jobs.job_as_jd(store.get("4"))
    with pytest.raises(ValueError):
        store.get("999")


def test_job_fit_schema_is_structured_output_compatible():
    from anthropic.lib._parse._transform import transform_schema

    from interview_prep.scoring import JobFitBatch

    schema = transform_schema(JobFitBatch)
    assert schema["additionalProperties"] is False


def test_score_and_prep_commands(tmp_path, monkeypatch):
    from interview_prep import cli, store
    from interview_prep.scoring import JobFit

    monkeypatch.setenv("PREP_HOME", str(tmp_path))
    store.save_default_resume("First GTM hire at a YC voice AI startup.")
    jobs.JobStore().merge([raw_job(1), raw_job(2, title="Founding GTM Lead")])

    class FakeCoach:
        def score_jobs(self, system, text):
            assert 'job id="1"' in text and "YC voice AI" in system[1]["text"]
            return [
                JobFit(job_id="1", fit="stretch", reason="r", gaps="enterprise years"),
                JobFit(job_id="2", fit="strong", reason="r", gaps="none"),
                JobFit(job_id="999", fit="strong", reason="ignored", gaps=""),
            ]

    monkeypatch.setattr(cli, "Coach", FakeCoach)
    cli.main(["jobs", "score"])
    saved = jobs.JobStore().load()
    assert saved["2"]["fit"] == "strong" and saved["1"]["fit_gaps"] == "enterprise years"
    assert "999" not in saved

    cli.main(["jobs", "prep", "2"])
    profile = store.Profile(store.get_active()).load()
    assert profile["company"] == "Acme AI" and "Founding GTM Lead" in profile["job_description"]
    assert jobs.JobStore().get("2")["status"] == "shortlisted"
