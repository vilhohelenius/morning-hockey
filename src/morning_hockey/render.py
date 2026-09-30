"""Render the archived digests into a static, mobile-friendly site."""
from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .formatting import human_date, season_label, short_date, translate_decision, translate_final_type

_PACKAGE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = _PACKAGE_DIR / "templates"
STATIC_DIR = _PACKAGE_DIR / "static"
STATIC_ASSETS = ("style.css", "app.js")


def _asset_version() -> str:
    """A short content hash of the static assets, used to cache-bust style.css
    and app.js so a redeploy doesn't get stuck behind a visitor's (or GitHub
    Pages CDN's) cached copy of a same-named file."""
    hasher = hashlib.sha256()
    for asset in STATIC_ASSETS:
        hasher.update((STATIC_DIR / asset).read_bytes())
    return hasher.hexdigest()[:10]


_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)
_env.filters["human_date"] = human_date
_env.filters["decision_fi"] = translate_decision
_env.filters["final_type_fi"] = translate_final_type
_env.filters["short_date"] = short_date
_env.globals["asset_version"] = _asset_version()

_MAX_ARCHIVE_LINKS = 14


def _nav(asset_prefix: str) -> dict[str, str]:
    return {
        "home": f"{asset_prefix}index.html",
        "leaderboard": f"{asset_prefix}pisteporssi.html",
        "standings": f"{asset_prefix}sarjataulukko.html",
        "playoffs": f"{asset_prefix}playoffit.html",
        "team_chi": f"{asset_prefix}joukkueet/chi.html",
        "archive": f"{asset_prefix}arkisto.html",
    }


def render_site(archive: list[dict], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "nights").mkdir(exist_ok=True)
    for asset in STATIC_ASSETS:
        shutil.copy(STATIC_DIR / asset, output_dir / asset)

    sorted_archive = sorted(archive, key=lambda d: d["date"], reverse=True)
    dates = [d["date"] for d in sorted_archive]

    night_template = _env.get_template("night.html")

    for digest in sorted_archive:
        other_dates = [d for d in dates if d != digest["date"]][:_MAX_ARCHIVE_LINKS]
        html = night_template.render(
            digest=digest,
            other_dates=other_dates,
            asset_prefix="../",
            is_index=False,
            nav=_nav("../"),
            active_page="night",
        )
        (output_dir / "nights" / f"{digest['date']}.html").write_text(html, encoding="utf-8")

    if sorted_archive:
        latest = sorted_archive[0]
        other_dates = dates[1 : _MAX_ARCHIVE_LINKS + 1]
        html = night_template.render(
            digest=latest,
            other_dates=other_dates,
            asset_prefix="",
            is_index=True,
            nav=_nav(""),
            active_page="home",
        )
    else:
        html = _env.get_template("empty.html").render(
            asset_prefix="", nav=_nav(""), active_page="home"
        )

    (output_dir / "index.html").write_text(html, encoding="utf-8")

    archive_entries = [
        {"date": d["date"], "game_count": len(d.get("games", []))} for d in sorted_archive
    ]
    archive_html = _env.get_template("archive.html").render(
        dates=archive_entries, asset_prefix="", nav=_nav(""), active_page="archive"
    )
    (output_dir / "arkisto.html").write_text(archive_html, encoding="utf-8")


def render_leaderboard(rows: list, season_id: int, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    html = _env.get_template("leaderboard.html").render(
        rows=rows,
        season_label=season_label(season_id),
        asset_prefix="",
        nav=_nav(""),
        active_page="leaderboard",
    )
    (output_dir / "pisteporssi.html").write_text(html, encoding="utf-8")


def render_standings(page, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    html = _env.get_template("standings.html").render(
        page=page,
        asset_prefix="",
        nav=_nav(""),
        active_page="standings",
    )
    (output_dir / "sarjataulukko.html").write_text(html, encoding="utf-8")


def render_playoffs(bracket, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    html = _env.get_template("playoffs.html").render(
        bracket=bracket,
        asset_prefix="",
        nav=_nav(""),
        active_page="playoffs",
    )
    (output_dir / "playoffit.html").write_text(html, encoding="utf-8")


def render_team_page(team, output_dir: Path) -> None:
    (output_dir / "joukkueet").mkdir(parents=True, exist_ok=True)
    html = _env.get_template("team.html").render(
        team=team,
        asset_prefix="../",
        nav=_nav("../"),
        active_page=f"team_{team.abbrev.lower()}",
    )
    (output_dir / "joukkueet" / f"{team.abbrev.lower()}.html").write_text(html, encoding="utf-8")
