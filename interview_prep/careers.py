"""Career-site scan: read job boards straight from Ashby, Greenhouse and Lever.

These public board APIs need no key and have no quota, so they cover the
companies the job APIs miss (small startups and AI labs). Give it a list of
board slugs (the name in the company's careers URL, e.g. "flowengineering"
for jobs.ashbyhq.com/flowengineering) and it returns the sales roles in the
chosen regions that aren't already tracked.

    python3 -m interview_prep.careers slugs.json index.json out.json

slugs.json is a JSON list of slugs (or a dict of lists). index.json is the
dashboard's meta/index document; its dedupe_keys and blocked_orgs are skipped.
"""

from __future__ import annotations

import html
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = {"User-Agent": "Mozilla/5.0"}

TITLE = re.compile(
    r"account executive|account director|enterprise sales|sales executive|sales lead|head of sales|"
    r"founding|business development (manager|lead|director)|commercial (lead|manager|director)|"
    r"gtm (lead|manager)|go-to-market|country manager|sales manager|sales director",
    re.I,
)
NOT_TITLE = re.compile(
    r"\b(sdr|bdr|development representative|engineer|operations|intern|associate|enablement|solutions|"
    r"customer success|account manager|marketing|recruit|analyst|deal desk|partner manager|trainer|counsel|"
    r"finance|talent|renewals?|inside sales|smb)\b|"
    r"french|german|italian|spanish|dutch|nordic|swedish|danish|norwegian|portuguese|japanese|korean|"
    r"mandarin|polish|turkish|hebrew|dach|benelux|iberia|\bcee\b|france|germany|italy|spain",
    re.I,
)
REGION = re.compile(
    r"london|united kingdom|\buk\b|emea|europe|^remote$|dubai|uae|united arab|abu dhabi|riyadh|saudi|ksa", re.I
)
NOT_REGION = re.compile(
    r"\bus\b|united states|usa|new york|san francisco|singapore|india|apac|canada|australia|toronto|austin|"
    r"chicago|boston|seattle|palo alto",
    re.I,
)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def dedupe_key(org: str, title: str) -> str:
    return norm(org) + "|" + re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def _get(url: str):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
            return json.loads(r.read())
    except Exception:
        return None


def _text(raw: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", html.unescape(raw or "")))).strip()


def board(slug: str, get=_get) -> list[dict]:
    """Every posting on one company's board, trying Ashby, then Greenhouse (US, EU), then Lever."""
    d = get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true")
    if d and d.get("jobs"):
        out = []
        for j in d["jobs"]:
            locs = [j.get("location") or ""] + [x.get("location", "") for x in j.get("secondaryLocations") or []]
            comp = j.get("compensation") if isinstance(j.get("compensation"), dict) else {}
            out.append(dict(org=slug, title=j["title"].strip(), loc=" / ".join(locs), url=j.get("jobUrl"),
                            date=(j.get("publishedAt") or "")[:10], comp=comp.get("compensationTierSummary"),
                            text=_text(j.get("descriptionPlain") or "")))
        return out
    for host in ("boards-api.greenhouse.io", "boards-api.eu.greenhouse.io"):
        d = get(f"https://{host}/v1/boards/{slug}/jobs?content=true")
        if d and d.get("jobs"):
            return [dict(org=slug, title=j["title"].strip(), loc=(j.get("location") or {}).get("name", ""),
                         url=j.get("absolute_url"), date=(j.get("first_published") or j.get("updated_at") or "")[:10],
                         comp=None, text=_text(j.get("content"))) for j in d["jobs"]]
    d = get(f"https://api.lever.co/v0/postings/{slug}?mode=json")
    if isinstance(d, list):
        out = []
        for j in d:
            c = j.get("categories") or {}
            loc = c.get("location", "") or " / ".join(c.get("allLocations") or [])
            body = (j.get("descriptionPlain") or "") + " " + " ".join(_text(x.get("content", "")) for x in j.get("lists", []))
            out.append(dict(org=slug, title=j["text"].strip(), loc=loc, url=j.get("hostedUrl"), date="", comp=None,
                            text=re.sub(r"\s+", " ", body).strip()))
        return out
    return []


def years_asked(text: str) -> list[str]:
    """The 'N+ years' phrases in a job description, for calibration."""
    return re.findall(r"(\d+)\s*\+?\s*(?:-|to|–)?\s*\d*\s*\+?\s*years", text)[:4]


def scan(slugs, seen=(), blocked=(), get=_get, workers=32) -> list[dict]:
    """New sales roles in the UK, Europe or the Gulf across the given boards."""
    seen, blocked = set(seen), {norm(b) for b in blocked}
    with ThreadPoolExecutor(workers) as ex:
        rows = [r for res in ex.map(lambda s: board(s, get), sorted(set(slugs))) for r in res]
    hits = []
    for r in rows:
        if any(norm(r["org"]).startswith(b) for b in blocked if b):
            continue
        if not TITLE.search(r["title"]) or NOT_TITLE.search(r["title"]):
            continue
        if not REGION.search(r["loc"] or "") or NOT_REGION.search(r["loc"] or ""):
            continue
        key = dedupe_key(r["org"], r["title"])
        if key in seen:
            continue
        seen.add(key)
        hits.append({**r, "key": key, "years": years_asked(r["text"]), "text": r["text"][:3000]})
    return hits


def main(argv=None) -> int:
    argv = argv or sys.argv[1:]
    if len(argv) != 3:
        print(__doc__)
        return 2
    slugs = json.load(open(argv[0]))
    if isinstance(slugs, dict):
        slugs = [s for v in slugs.values() for s in v]
    idx = json.load(open(argv[1]))
    idx = idx.get("data", idx)
    hits = scan(slugs, idx.get("dedupe_keys", []), idx.get("blocked_orgs", []))
    json.dump(hits, open(argv[2], "w"), indent=1)
    for h in hits:
        print(f"{h['org']} | {h['title'][:70]} | {h['loc'][:40]} | {h['date']} | years {h['years']} | {h['comp'] or ''}")
    print(f"{len(hits)} new roles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
