"""CLI entry point: build tonight's digest, update the archive and site, notify."""
from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict
from pathlib import Path

from .digest import build_digest
from .league_stats import build_goalie_top, build_skater_top
from .nhl_api import NHLClient
from .notify import send_ntfy, send_team_recap
from .playoffs import build_bracket
from .render import (
    render_league_stats,
    render_playoffs,
    render_site,
    render_standings,
    render_suomiporssi,
    render_team_page,
)
from .standings import build_standings
from .suomiporssi import build_goalie_leaderboard, build_leaderboard, current_season_id
from .team import build_team_page
from .team_recap import build_team_recap

DATA_DIR = Path("data")
SITE_DIR = Path("site")

# Team dashboards to build. Intentionally just one team for now rather than
# a full 32-team selector.
TEAM_ABBREVS = ("CHI",)


def _archive_path(date: str) -> Path:
    return DATA_DIR / f"{date}.json"


def _load_archive() -> list[dict]:
    if not DATA_DIR.exists():
        return []
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(DATA_DIR.glob("*.json"))]


def run(pages_base_url: str, ntfy_topic: str | None, ntfy_server: str) -> None:
    client = NHLClient()
    digest = build_digest(client)

    DATA_DIR.mkdir(exist_ok=True)
    if digest.games:
        _archive_path(digest.date).write_text(
            json.dumps(asdict(digest), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"{digest.date}: {len(digest.games)} completed game(s) recorded.")
    else:
        print(f"{digest.date}: no completed games, nothing to record.")

    render_site(_load_archive(), SITE_DIR)

    season_id = current_season_id(client)
    fin_skaters = build_leaderboard(client, season_id)
    fin_goalies = build_goalie_leaderboard(client, season_id)
    render_suomiporssi(fin_skaters, fin_goalies, season_id, SITE_DIR)
    print(f"Suomipörssi: {len(fin_skaters)} pelaajaa, {len(fin_goalies)} maalivahtia kaudelta {season_id}.")

    skater_top = build_skater_top(client, season_id)
    goalie_top = build_goalie_top(client, season_id)
    render_league_stats(skater_top, goalie_top, season_id, SITE_DIR)
    print(f"Tilastot: {len(skater_top)} kenttäpelaajaa, {len(goalie_top)} maalivahtia.")

    standings_page = build_standings(client)
    render_standings(standings_page, SITE_DIR)
    print(f"Sarjataulukko: tilanne {standings_page.as_of_date}.")

    bracket = build_bracket(standings_page)
    render_playoffs(bracket, SITE_DIR)
    print(f"Playoff-puu: tilanne {bracket.as_of_date}.")

    for team_abbrev in TEAM_ABBREVS:
        team_page = build_team_page(client, team_abbrev, season_id)
        render_team_page(team_page, SITE_DIR)
        print(f"Joukkuesivu: {team_page.name}")

    if digest.games and ntfy_topic:
        page_url = f"{pages_base_url.rstrip('/')}/nights/{digest.date}.html"
        send_ntfy(digest, page_url, ntfy_topic, ntfy_server)
        print(f"ntfy notification sent, linking to {page_url}")

    for team_abbrev in TEAM_ABBREVS:
        recap = build_team_recap(client, team_abbrev)
        if recap is None:
            print(f"{team_abbrev}: ei ottelua viime yönä, ei erillistä ilmoitusta.")
            continue
        if ntfy_topic:
            team_page_url = f"{pages_base_url.rstrip('/')}/joukkueet/{team_abbrev.lower()}.html"
            send_team_recap(recap, team_page_url, ntfy_topic, ntfy_server)
            print(f"{team_abbrev}-ilmoitus lähetetty, linkkinä {team_page_url}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the nightly NHL digest and notify.")
    parser.add_argument(
        "--pages-base-url",
        required=True,
        help="Public base URL of the deployed site, e.g. https://user.github.io/repo",
    )
    parser.add_argument("--ntfy-server", default="https://ntfy.sh")
    args = parser.parse_args()

    run(args.pages_base_url, os.environ.get("NTFY_TOPIC"), args.ntfy_server)


if __name__ == "__main__":
    main()
