"""Local persistence: one directory per target role.

    $PREP_HOME/                      (default ./prep_data)
      active                         slug of the active profile
      <slug>/profile.json            company, role, JD, resume text, notes
      <slug>/dossier.md              company research
      <slug>/brief.md                prep brief
      <slug>/sessions/<ts>.json      transcript + scorecard for each mock
      <slug>/sessions/<ts>.md        human-readable scorecard
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path


def home() -> Path:
    return Path(os.environ.get("PREP_HOME", "prep_data"))


def slugify(company: str, role: str) -> str:
    text = f"{company}-{role}".lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:60] or "profile"


class Profile:
    def __init__(self, slug: str, root: Path | None = None):
        self.slug = slug
        self.dir = (root or home()) / slug

    # --- profile ---------------------------------------------------------
    @property
    def exists(self) -> bool:
        return (self.dir / "profile.json").exists()

    def load(self) -> dict:
        return json.loads((self.dir / "profile.json").read_text())

    def save(self, data: dict) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / "profile.json").write_text(json.dumps(data, indent=2))

    # --- documents -------------------------------------------------------
    def read_doc(self, name: str) -> str | None:
        path = self.dir / name
        return path.read_text() if path.exists() else None

    def write_doc(self, name: str, text: str) -> Path:
        path = self.dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    # --- sessions --------------------------------------------------------
    @property
    def sessions_dir(self) -> Path:
        return self.dir / "sessions"

    def save_session(self, record: dict, scorecard_md: str | None) -> Path:
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        path = self.sessions_dir / f"{stamp}.json"
        path.write_text(json.dumps(record, indent=2))
        if scorecard_md:
            path.with_suffix(".md").write_text(scorecard_md)
        return path

    def sessions(self) -> list[dict]:
        if not self.sessions_dir.exists():
            return []
        return [json.loads(p.read_text()) for p in sorted(self.sessions_dir.glob("*.json"))]

    def scorecards(self) -> list[dict]:
        return [s["scorecard"] for s in self.sessions() if s.get("scorecard")]


def set_active(slug: str, root: Path | None = None) -> None:
    root = root or home()
    root.mkdir(parents=True, exist_ok=True)
    (root / "active").write_text(slug)


def get_active(root: Path | None = None) -> str | None:
    path = (root or home()) / "active"
    return path.read_text().strip() if path.exists() else None


def list_profiles(root: Path | None = None) -> list[str]:
    root = root or home()
    if not root.exists():
        return []
    return sorted(p.parent.name for p in root.glob("*/profile.json"))
