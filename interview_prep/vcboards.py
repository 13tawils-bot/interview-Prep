"""VC portfolio job boards: every sales role across the funds' portfolio companies.

Most VC firms host a jobs board listing open roles at all their portfolio companies,
on one of two platforms: Consider (jobs.sequoiacap.com and others) or Getro
(jobs.accel.com and others). Both serve JSON to the board's own page with no key, so
this reads them directly, keeps senior sales roles in the UK, Europe or the Gulf at
private (not acquired, PE-owned or public) companies, and drops anything already
tracked or blocked.

    python3 -m interview_prep.vcboards index.json out.json

index.json is the dashboard's meta/index document (dedupe_keys, blocked_orgs).
"""

from __future__ import annotations

import concurrent.futures as cf
import http.cookiejar
import json
import re
import sys
import time
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36"
CONSIDER = ['jobs.sequoiacap.com', 'jobs.lsvp.com', 'jobs.notion.vc', 'jobs.firstround.com', 'jobs.kleinerperkins.com', 'jobs.gv.com', 'jobs.bvp.com', 'jobs.felicis.com', 'jobs.hoxtonventures.com', 'careers.nea.com', 'jobs.costanoa.vc', 'jobs.crv.com', 'jobs.battery.com', 'careers.balderton.com', 'jobs.baincapitalventures.com', 'jobs.usv.com', 'jobs.initialized.com', 'jobs.contrary.com', 'jobs.forerunnerventures.com', 'jobs.congruentvc.com', 'jobs.amadeuscapital.com', 'jobs.anthemis.com', 'portfoliojobs.a16z.com', 'careers.highlandeurope.com', 'careers.playfair.vc', 'careers.extantia.com']
GETRO = ['jobs.accel.com', 'careers.atomico.com', 'jobs.thrivecap.com', 'jobs.insightpartners.com', 'jobs.khoslaventures.com', 'jobs.luxcapital.com', 'jobs.pointnine.com', 'jobs.dawncapital.com', 'jobs.firstminute.capital', 'jobs.mmc.vc', 'jobs.generalcatalyst.com', 'jobs.8vc.com', 'talent.seedcamp.com', 'creandum.getro.com', 'talent.octopusventures.com', 'radical.getro.com', 'jobs.hvcapital.com', 'indexventures.getro.com', 'lowercarbon.getro.com', 'jobs.nfx.com', 'foundersfund.getro.com', 'jobs.earlybird.com', 'careers.redpoint.com', 'jobs.menlovc.com', 'jobs.craftventures.com', 'jobs.madrona.com', 'jobs.lererhippeau.com', 'jobs.headline.com', 'jobs.signalfire.com', 'jobs.ggvc.com', 'jobs.dcvc.com', 'talent.cherry.vc', 'careers.speedinvest.com', 'jobs.kindredcapital.vc']


def opener():
    cj = http.cookiejar.CookieJar()
    o = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    o.addheaders = [("User-Agent", UA)]
    return o


def consider(host):
    o = opener()
    html = o.open(f"https://{host}/jobs", timeout=30).read().decode("utf8", "ignore")
    tok = re.search(r'csrfToken":"([^"]+)', html).group(1)
    bid = re.search(r'"board":\{"id":"([^"]+)","isParent":(true|false)', html)
    rows, seq = [], None
    for _ in range(60):
        meta = {"size": 100}
        if seq: meta["sequence"] = seq
        body = json.dumps({"meta": meta, "board": {"id": bid.group(1), "isParent": bid.group(2) == "true"},
                           "query": {"jobFunctions": ["Sales"]}, "grouped": False}).encode()
        req = urllib.request.Request(f"https://{host}/api-boards/search-jobs", body,
                                     {"content-type": "application/json", "x-csrf-token": tok})
        d = json.loads(o.open(req, timeout=30).read())
        for j in d.get("jobs", []):
            rows.append(dict(board=host, org=j.get("companyName"), domain=j.get("companyDomain"), title=j.get("title"),
                             locs=j.get("locations") or [], remote=j.get("remote"), url=j.get("applyUrl") or j.get("url"),
                             staff=j.get("companyStaffCount"), date=(j.get("timeStamp") or j.get("createdAt") or "")[:10],
                             salary=j.get("salary"), stage=None))
        seq = (d.get("meta") or {}).get("sequence")
        if not seq or not d.get("jobs"): break
    return rows


def getro(host):
    o = opener()
    html = o.open(f"https://{host}/jobs", timeout=30).read().decode("utf8", "ignore")
    nd = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S).group(1))
    nid = nd["props"]["pageProps"]["network"]["id"]
    rows = []
    for loc in ["United Kingdom", "United Arab Emirates", "Saudi Arabia", "Qatar", "Europe", "Remote"]:
        for page in range(0, 200):
            body = json.dumps({"hitsPerPage": 20, "page": page,
                               "filters": {"searchable_locations": [loc], "job_functions": ["Sales & Business Development"]},
                               "query": ""}).encode()
            req = urllib.request.Request(f"https://api.getro.com/api/v2/collections/{nid}/search/jobs", body,
                                         {"content-type": "application/json", "accept": "application/json",
                                          "origin": f"https://{host}"})
            try:
                d = json.loads(o.open(req, timeout=30).read())["results"]
            except Exception as e:
                print(host, loc, page, "err", e, file=sys.stderr); break
            for j in d["jobs"]:
                org = j.get("organization") or {}
                rows.append(dict(board=host, org=org.get("name"), domain=org.get("slug"), title=j.get("title"),
                                 locs=j.get("locations") or [], remote=j.get("workMode"), url=j.get("url"),
                                 staff=org.get("headCount"), stage=org.get("stage"),
                                 date=time.strftime("%Y-%m-%d", time.gmtime(j["createdAt"])) if j.get("createdAt") else "",
                                 salary=None, seniority=j.get("seniority")))
            if len(d["jobs"]) < 20 or (page + 1) * 20 >= d["count"]: break
            time.sleep(0.15)
    return rows



def harvest(log=sys.stderr):
    def safe(f, h):
        try:
            r = f(h)
            print(h, len(r), file=log)
            return r
        except Exception as e:
            print(h, "FAILED", e, file=log)
            return []

    with cf.ThreadPoolExecutor(8) as ex:
        futs = [ex.submit(safe, consider, h) for h in CONSIDER] + [ex.submit(safe, getro, h) for h in GETRO]
        return [r for f in futs for r in f.result()]

TITLE=re.compile(r"account executive|account director|sales director|director of sales|head of sales|vp,? sales|vice president.{0,12}sales|sales lead|lead.{0,5}sales|sales manager|founding|business development (lead|manager|director)|head of business development|commercial (lead|director|manager)|head of commercial|gtm lead|go-to-market lead|head of gtm|country manager|general manager|partnerships lead|head of partnerships|launcher|enterprise sales|strategic sales|new business|growth lead|regional director|sales executive|head of growth",re.I)
BADT=re.compile(r"\b(sdr|bdr|development rep|representative|intern|internship|apprentice|graduate|associate|account manager|customer success|solutions? (engineer|consultant|architect)|sales engineer|pre-?sales|renewal|enablement|operations|ops|marketing|recruit|analyst|coordinator|assistant|support|retail sales|store|smb|small business|field|inside sales|channel sales associate)\b|french|german|italian|spanish|dutch|nordic|swedish|danish|norwegian|finnish|portuguese|japanese|korean|mandarin|chinese|polish|turkish|hebrew|greek|czech|hungarian|romanian|dach|benelux|iberia|\bcee\b|france|germany|italy|spain|netherlands|nordics|poland|switzerland|austria|belgium|israel|india|apac|latam|brazil|mexico",re.I)
UK=re.compile(r"london|united kingdom|\buk\b|england|scotland|edinburgh|manchester|cambridge, uk|oxford|bristol|leeds|glasgow|wales|belfast",re.I)
GULF=re.compile(r"dubai|abu dhabi|united arab emirates|\buae\b|saudi|riyadh|jeddah|qatar|doha|bahrain|kuwait|oman|middle east|mena|gcc",re.I)
EUREM=re.compile(r"emea|europe",re.I)
US=re.compile(r"united states|\busa\b|new york|san francisco|california|\bny\b|\bca\b|texas|boston|seattle|chicago",re.I)
BIGORG={'swiftkey','spindleaispindleai','spindleai','microsoft','salesforce','google','amazon','meta','oracle','sap','ibm','adobe'}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def key(org, title):
    return norm(org) + "|" + re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


def candidates(rows, seen=(), blocked=()):
    """Senior sales roles in the UK, Gulf or Europe-remote at private companies, not yet tracked."""
    seen, blocked = set(seen), [norm(b) for b in blocked if norm(b)]
    out, dup = [], set()
    for r in rows:
        t, o = r.get("title") or "", r.get("org") or ""
        if not TITLE.search(t) or BADT.search(t):
            continue
        locs = " / ".join(r.get("locs") or [])
        if re.search(r"new england|north wales, pa|new south wales", locs, re.I):
            continue
        reg = "uk" if UK.search(locs) else "gulf" if GULF.search(locs) else ("eu-remote" if EUREM.search(locs) and not US.search(locs) else None)
        if not reg:
            continue
        no = norm(o)
        if no in BIGORG or any(no.startswith(b) for b in blocked):
            continue
        try:
            staff = int(r.get("staff") or 0)
        except (TypeError, ValueError):
            staff = 0
        if staff > 5000 or r.get("stage") in ("acquisition", "private_equity", "ipo"):
            continue
        k = key(o, t)
        if k in seen or k in dup:
            continue
        dup.add(k)
        out.append(dict(r, region=reg, locstr=locs[:120], key=k))
    return out


def main(argv=None):
    argv = argv or sys.argv[1:]
    if len(argv) != 2:
        print(__doc__)
        return 2
    idx = json.load(open(argv[0]))
    idx = idx.get("data", idx)
    found = candidates(harvest(), idx.get("dedupe_keys", []), idx.get("blocked_orgs", []))
    json.dump(found, open(argv[1], "w"), indent=1)
    for c in sorted(found, key=lambda c: (c["region"], c["org"] or "")):
        print(f"{c['region']} | {c['org']} | {c['title'][:70]} | {c['locstr'][:40]} | {c.get('stage') or ''} | {c['url']}")
    print(f"{len(found)} candidates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
