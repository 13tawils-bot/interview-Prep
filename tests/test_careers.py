from interview_prep import careers


def fake_get(url):
    if "ashbyhq" in url and "/acme?" in url:
        return {"jobs": [
            {"title": "Founding Account Executive", "location": "London", "jobUrl": "u1", "publishedAt": "2026-10-01T00:00:00Z",
             "descriptionPlain": "You have 5+ years of full-cycle sales."},
            {"title": "Account Executive", "location": "San Francisco", "jobUrl": "u2"},
            {"title": "Software Engineer", "location": "London", "jobUrl": "u3"},
            {"title": "Account Executive, DACH", "location": "Remote", "jobUrl": "u4"},
        ]}
    if "greenhouse.io/v1/boards/beta/" in url:
        return {"jobs": [{"title": "Enterprise Account Executive", "location": {"name": "Dubai"}, "absolute_url": "g1",
                          "content": "&lt;p&gt;Sell things&lt;/p&gt;"}]}
    return None


def test_scan_filters_region_title_seen_and_blocked():
    hits = careers.scan(["acme", "beta", "gone"], get=fake_get, workers=2)
    assert [(h["org"], h["title"]) for h in hits] == [
        ("acme", "Founding Account Executive"), ("beta", "Enterprise Account Executive")]
    assert hits[0]["years"] == ["5"] and hits[0]["date"] == "2026-10-01"
    assert hits[1]["text"] == "Sell things"

    seen = [careers.dedupe_key("acme", "Founding Account Executive")]
    assert [h["org"] for h in careers.scan(["acme", "beta"], seen=seen, get=fake_get)] == ["beta"]
    assert [h["org"] for h in careers.scan(["acme", "beta"], blocked=["Beta"], get=fake_get)] == ["acme"]
