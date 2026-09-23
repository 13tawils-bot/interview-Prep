"""Load resumes and job descriptions from text, Markdown, or PDF files."""

from __future__ import annotations

import sys
from pathlib import Path


def read_text_input(source: str) -> str:
    """Read a file path, or stdin when source is '-'. PDFs are converted to text."""
    if source == "-":
        return sys.stdin.read()
    path = Path(source).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"No such file: {path}")
    if path.suffix.lower() == ".pdf":
        return _pdf_text(path)
    return path.read_text(encoding="utf-8", errors="replace")


def _pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if not text:
        raise ValueError(
            f"{path} has no extractable text (it may be a scanned image). "
            "Export it as text or paste the content into a .txt file."
        )
    return text
