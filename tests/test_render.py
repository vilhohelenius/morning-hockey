from pathlib import Path

from morning_hockey.leaderboard import LeaderboardRow
from morning_hockey.render import render_leaderboard, render_site, render_team_page
from morning_hockey.team import DivisionRow, RosterPlayer, TeamPage

DIGEST = {
    "date": "2026-09-29",
    "generated_at": "2026-09-30T06:00:00+00:00",
    "games": [
        {
            "game_id": 2026020001,
            "away": {"abbrev": "FLA", "name": "Panthers", "logo": "https://example.com/fla.svg", "score": 1},
            "home": {"abbrev": "CAR", "name": "Hurricanes", "logo": "https://example.com/car.svg", "score": 3},
            "final_type": "OT",
            "scorers": [{"name": "Sebastian Aho", "team": "CAR", "goals": 2, "assists": 1}],
            "goalies": [],
        }
    ],
}


def test_render_site_writes_index_and_night_page(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_site([DIGEST], output_dir)

    assert (output_dir / "style.css").exists()
    assert (output_dir / "app.js").exists()
    assert (output_dir / "index.html").exists()
    assert (output_dir / "arkisto.html").exists()
    assert (output_dir / "nights" / "2026-09-29.html").exists()

    index_html = (output_dir / "index.html").read_text(encoding="utf-8")
    assert "Sebastian Aho" in index_html
    assert "FLA" in index_html and "CAR" in index_html
    assert 'href="arkisto.html"' in index_html
    assert 'href="pisteporssi.html"' in index_html
    assert 'href="joukkueet/chi.html"' in index_html

    night_html = (output_dir / "nights" / "2026-09-29.html").read_text(encoding="utf-8")
    assert 'href="../arkisto.html"' in night_html

    archive_html = (output_dir / "arkisto.html").read_text(encoding="utf-8")
    assert "1 ottelua" in archive_html
    assert 'href="nights/2026-09-29.html"' in archive_html


def test_render_site_handles_empty_archive(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_site([], output_dir)

    assert "Ei vielä otteluita" in (output_dir / "index.html").read_text(encoding="utf-8")
    assert (output_dir / "arkisto.html").exists()


def test_render_leaderboard_writes_page_with_rows(tmp_path: Path):
    output_dir = tmp_path / "site"
    rows = [
        LeaderboardRow(
            player_id=8477493,
            name="Aleksander Barkov",
            team="FLA",
            logo="https://assets.nhle.com/logos/nhl/svg/FLA_light.svg",
            headshot="https://assets.nhle.com/mugs/nhl/20262027/FLA/8477493.png",
            position="C",
            games_played=1,
            goals=1,
            assists=2,
            points=3,
        )
    ]

    render_leaderboard(rows, 20262027, output_dir)

    html = (output_dir / "pisteporssi.html").read_text(encoding="utf-8")
    assert "Aleksander Barkov" in html
    assert "2026" in html and "2027" in html
    assert 'src="https://assets.nhle.com/mugs/nhl/20262027/FLA/8477493.png"' in html
    assert 'src="https://assets.nhle.com/logos/nhl/svg/FLA_light.svg"' in html


def test_render_leaderboard_handles_no_rows(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_leaderboard([], 20262027, output_dir)

    html = (output_dir / "pisteporssi.html").read_text(encoding="utf-8")
    assert "Ei tilastoituja" in html


def test_render_team_page_writes_under_joukkueet(tmp_path: Path):
    output_dir = tmp_path / "site"
    team = TeamPage(
        abbrev="CHI",
        name="Chicago Blackhawks",
        logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
        division_name="Central",
        division_rank=2,
        streak="L1",
        division_table=[
            DivisionRow(
                abbrev="CHI",
                name="Blackhawks",
                logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
                rank=2,
                games_played=1,
                wins=0,
                losses=1,
                ot_losses=0,
                points=0,
                is_team=True,
            )
        ],
        roster={
            "forwards": [
                RosterPlayer(
                    player_id=1,
                    name="Tyler Bertuzzi",
                    position="L",
                    sweater_number=59,
                    headshot="https://assets.nhle.com/mugs/nhl/20262027/CHI/1.png",
                )
            ],
            "defensemen": [],
            "goalies": [],
        },
        recent_games=[],
        upcoming_games=[],
    )

    render_team_page(team, output_dir)

    html = (output_dir / "joukkueet" / "chi.html").read_text(encoding="utf-8")
    assert "Chicago Blackhawks" in html
    assert "Tyler Bertuzzi" in html
    assert 'href="../index.html"' in html
