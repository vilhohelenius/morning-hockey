"""Render the archived digests into a static, mobile-friendly site."""
from __future__ import annotations

import shutil
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .formatting import human_date, translate_decision, translate_final_type

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TEMPLATES_DIR = _REPO_ROOT / "templates"
STATIC_DIR = _REPO_ROOT / "static"

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)
_env.filters["human_date"] = human_date
_env.filters["decision_fi"] = translate_decision
_env.filters["final_type_fi"] = translate_final_type

_MAX_ARCHIVE_LINKS = 14


def render_site(archive: list[dict], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "nights").mkdir(exist_ok=True)
    shutil.copy(STATIC_DIR / "style.css", output_dir / "style.css")

    sorted_archive = sorted(archive, key=lambda d: d["date"], reverse=True)
    dates = [d["date"] for d in sorted_archive]

    night_template = _env.get_template("night.html")

    for digest in sorted_archive:
        other_dates = [d for d in dates if d != digest["date"]][:_MAX_ARCHIVE_LINKS]
        html = night_template.render(
            digest=digest, other_dates=other_dates, asset_prefix="../", is_index=False
        )
        (output_dir / "nights" / f"{digest['date']}.html").write_text(html, encoding="utf-8")

    if sorted_archive:
        latest = sorted_archive[0]
        other_dates = dates[1 : _MAX_ARCHIVE_LINKS + 1]
        html = night_template.render(
            digest=latest, other_dates=other_dates, asset_prefix="", is_index=True
        )
    else:
        html = _env.get_template("empty.html").render()

    (output_dir / "index.html").write_text(html, encoding="utf-8")
