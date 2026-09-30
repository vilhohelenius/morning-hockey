"""Render the archived digests into a static, mobile-friendly site."""
from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import asdict
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .formatting import (
    finnish_time,
    human_date,
    nationality_flag,
    season_label,
    short_date,
    translate_decision,
    translate_final_type,
)

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
_env.filters["nationality_flag"] = nationality_flag
_env.filters["finnish_time"] = finnish_time
_env.globals["asset_version"] = _asset_version()

_MAX_ARCHIVE_LINKS = 14


def _game_details_json(digest: dict | None) -> str:
    """Embeddable {game_id: box_score} map for a digest dict's games that
    have one — older archived nights predating this feature just won't be
    keyed here, and the click handler quietly does nothing for them."""
    if digest is None:
        return "{}"
    details = {
        str(game["game_id"]): game["box_score"]
        for game in digest.get("games", [])
        if game.get("box_score")
    }
    return json.dumps(details, ensure_ascii=False).replace("</", "<\\/")


def _nav(asset_prefix: str) -> dict[str, str]:
    return {
        "home": f"{asset_prefix}index.html",
        "suomiporssi": f"{asset_prefix}suomiporssi.html",
        "standings": f"{asset_prefix}sarjataulukko.html",
        "playoffs": f"{asset_prefix}playoffit.html",
        "primetime": f"{asset_prefix}primetime.html",
        "league_stats": f"{asset_prefix}tilastot.html",
        "rookies": f"{asset_prefix}rookiet.html",
        "team_chi": f"{asset_prefix}joukkueet/chi.html",
        "archive": f"{asset_prefix}arkisto.html",
    }


def render_archive_pages(archive: list[dict], output_dir: Path) -> None:
    """Renders nights/<date>.html for every archived night, plus arkisto.html.
    Does not touch index.html — see render_dashboard for that."""
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
            game_details_json=_game_details_json(digest),
            asset_prefix="../",
            nav=_nav("../"),
            active_page="night",
        )
        (output_dir / "nights" / f"{digest['date']}.html").write_text(html, encoding="utf-8")

    archive_entries = [
        {"date": d["date"], "game_count": len(d.get("games", []))} for d in sorted_archive
    ]
    archive_html = _env.get_template("archive.html").render(
        dates=archive_entries, asset_prefix="", nav=_nav(""), active_page="archive"
    )
    (output_dir / "arkisto.html").write_text(archive_html, encoding="utf-8")


def render_dashboard(
    archive: list[dict],
    fin_skaters: list,
    league_skaters: list,
    team,
    output_dir: Path,
) -> None:
    """Renders index.html: last night's games + top-5 previews + a Blackhawks
    teaser, pulling from data the other render_* calls already built."""
    output_dir.mkdir(parents=True, exist_ok=True)

    sorted_archive = sorted(archive, key=lambda d: d["date"], reverse=True)
    latest_digest = sorted_archive[0] if sorted_archive else None
    other_dates = [d["date"] for d in sorted_archive[1 : _MAX_ARCHIVE_LINKS + 1]]

    html = _env.get_template("dashboard.html").render(
        latest_digest=latest_digest,
        other_dates=other_dates,
        game_details_json=_game_details_json(latest_digest),
        fin_skaters=fin_skaters,
        league_skaters=league_skaters,
        team=team,
        asset_prefix="",
        nav=_nav(""),
        active_page="home",
    )
    (output_dir / "index.html").write_text(html, encoding="utf-8")


def render_suomiporssi(skaters: list, goalies: list, season_id: int, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    html = _env.get_template("suomiporssi.html").render(
        skaters=skaters,
        goalies=goalies,
        season_label=season_label(season_id),
        asset_prefix="",
        nav=_nav(""),
        active_page="suomiporssi",
    )
    (output_dir / "suomiporssi.html").write_text(html, encoding="utf-8")


def render_standings(page, snapshots: dict, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    snapshots_json = json.dumps(
        {abbrev: asdict(snapshot) for abbrev, snapshot in snapshots.items()}, ensure_ascii=False
    ).replace("</", "<\\/")
    html = _env.get_template("standings.html").render(
        page=page,
        snapshots_json=snapshots_json,
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


def render_primetime(page, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    html = _env.get_template("primetime.html").render(
        page=page,
        asset_prefix="",
        nav=_nav(""),
        active_page="primetime",
    )
    (output_dir / "primetime.html").write_text(html, encoding="utf-8")


def render_league_stats(skaters: list, goalies: list, season_id: int, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    html = _env.get_template("league_stats.html").render(
        skaters=skaters,
        goalies=goalies,
        season_label=season_label(season_id),
        asset_prefix="",
        nav=_nav(""),
        active_page="league_stats",
    )
    (output_dir / "tilastot.html").write_text(html, encoding="utf-8")


def render_rookies(rookies: list, season_id: int, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    html = _env.get_template("rookiet.html").render(
        rookies=rookies,
        season_label=season_label(season_id),
        asset_prefix="",
        nav=_nav(""),
        active_page="rookies",
    )
    (output_dir / "rookiet.html").write_text(html, encoding="utf-8")


def render_team_page(team, output_dir: Path) -> None:
    (output_dir / "joukkueet").mkdir(parents=True, exist_ok=True)
    html = _env.get_template("team.html").render(
        team=team,
        asset_prefix="../",
        nav=_nav("../"),
        active_page=f"team_{team.abbrev.lower()}",
    )
    (output_dir / "joukkueet" / f"{team.abbrev.lower()}.html").write_text(html, encoding="utf-8")
