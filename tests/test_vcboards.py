from interview_prep import vcboards


def row(org, title, locs, **kw):
    return dict(org=org, title=title, locs=locs, url="u", **kw)


def test_candidates_keeps_senior_sales_in_target_regions_only():
    rows = [
        row("Electric Twin", "Account Executive, Enterprise", ["London, UK"], stage="series_a"),
        row("Acme", "Founding Account Executive", ["Dubai, United Arab Emirates"]),
        row("Acme", "Founding Account Executive", ["Dubai, United Arab Emirates"]),  # duplicate
        row("Big Co", "Account Executive", ["London, UK"], stage="acquisition"),
        row("Huge", "Account Executive", ["London, UK"], staff=90000),
        row("Beta", "Sales Development Representative", ["London, UK"]),
        row("Gamma", "Account Executive", ["New York, NY"]),
        row("Delta", "Account Executive - New England", ["New England (US)"]),
        row("Rejecter", "Account Executive", ["London, UK"]),
        row("Seen Co", "Account Executive", ["London, UK"]),
    ]
    out = vcboards.candidates(rows, seen=[vcboards.key("Seen Co", "Account Executive")], blocked=["Rejecter"])
    assert [(c["org"], c["region"]) for c in out] == [("Electric Twin", "uk"), ("Acme", "gulf")]
