import re
from pathlib import Path

from morning_hockey.render import render_site, render_standings, render_suomiporssi, render_team_page
from morning_hockey.suomiporssi import GoalieLeaderboardRow, LeaderboardRow
from morning_hockey.standings import Conference, Division, StandingsPage, StandingsRow
from morning_hockey.team import DivisionRow, RosterSkater, TeamPage

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
    assert 'href="suomiporssi.html"' in index_html
    assert 'href="sarjataulukko.html"' in index_html
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


def test_render_suomiporssi_writes_skaters_and_goalies(tmp_path: Path):
    output_dir = tmp_path / "site"
    skaters = [
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
    goalies = [
        GoalieLeaderboardRow(
            player_id=8477293,
            name="Juuse Saros",
            team="NSH",
            logo="https://assets.nhle.com/logos/nhl/svg/NSH_light.svg",
            headshot="https://assets.nhle.com/mugs/nhl/20262027/NSH/8477293.png",
            games_played=1,
            wins=1,
            losses=0,
            ot_losses=0,
            goals_against_average=1.5,
            save_pct=0.955,
            shutouts=0,
        )
    ]

    render_suomiporssi(skaters, goalies, 20262027, output_dir)

    html = (output_dir / "suomiporssi.html").read_text(encoding="utf-8")
    assert "Aleksander Barkov" in html
    assert "Juuse Saros" in html
    assert "2026" in html and "2027" in html
    assert 'src="https://assets.nhle.com/mugs/nhl/20262027/FLA/8477493.png"' in html
    assert "0.955" in html


def test_render_suomiporssi_handles_no_rows(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_suomiporssi([], [], 20262027, output_dir)

    html = (output_dir / "suomiporssi.html").read_text(encoding="utf-8")
    assert "Ei tilastoituja suomalaispelaajia" in html
    assert "Ei tilastoituja suomalaisia maalivahteja" in html


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
        skaters=[
            RosterSkater(
                player_id=1,
                name="Tyler Bertuzzi",
                position="L",
                sweater_number=59,
                headshot="https://assets.nhle.com/mugs/nhl/20262027/CHI/1.png",
                games_played=1,
                goals=1,
                assists=0,
                points=1,
            )
        ],
        goalies=[],
        recent_games=[],
        upcoming_games=[],
    )

    render_team_page(team, output_dir)

    html = (output_dir / "joukkueet" / "chi.html").read_text(encoding="utf-8")
    assert "Chicago Blackhawks" in html
    assert "Tyler Bertuzzi" in html
    assert 'href="../index.html"' in html


def test_render_standings_writes_divisions_and_wildcard_race(tmp_path: Path):
    output_dir = tmp_path / "site"
    row_kwargs = dict(
        logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
        games_played=1,
        wins=1,
        losses=0,
        ot_losses=0,
        points=2,
        goal_differential=3,
    )
    page = StandingsPage(
        as_of_date="2026-09-29",
        divisions=[
            Division(
                name="Central",
                conference="Western",
                rows=[
                    StandingsRow(division_rank=1, wildcard_rank=0, abbrev="CHI", name="Blackhawks", qualified=True, **row_kwargs)
                ],
            )
        ],
        conferences=[
            Conference(
                name="Western",
                wildcard_race=[
                    StandingsRow(division_rank=4, wildcard_rank=1, abbrev="NSH", name="Predators", qualified=True, **row_kwargs)
                ],
            )
        ],
    )

    render_standings(page, output_dir)

    html = (output_dir / "sarjataulukko.html").read_text(encoding="utf-8")
    assert "Central" in html
    assert "CHI" in html
    assert "Western-konferenssi" in html
    assert "NSH" in html
    # legend dot + one qualified row in the division + one in the wildcard race
    assert html.count("playoff-dot") == 3


def test_render_playoffs_writes_round1_and_placeholders(tmp_path: Path):
    from morning_hockey.playoffs import ConferenceBracket, Matchup, PlayoffBracket
    from morning_hockey.render import render_playoffs
    from morning_hockey.standings import StandingsRow

    row_kwargs = dict(
        logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
        games_played=10,
        wins=6,
        losses=3,
        ot_losses=1,
        points=13,
        goal_differential=5,
        qualified=True,
    )
    a = StandingsRow(division_rank=1, wildcard_rank=0, abbrev="COL", name="Avalanche", **row_kwargs)
    b = StandingsRow(division_rank=4, wildcard_rank=2, abbrev="NSH", name="Predators", **row_kwargs)

    bracket = PlayoffBracket(
        as_of_date="2026-12-01",
        conferences=[
            ConferenceBracket(
                name="Western",
                round1=[
                    Matchup("Central 1", a, "Villikortti 2", b),
                    Matchup("Central 2", a, "Central 3", b),
                    Matchup("Pacific 1", a, "Villikortti 1", b),
                    Matchup("Pacific 2", a, "Pacific 3", b),
                ],
                wildcard_race=[b],
            )
        ],
    )

    output_dir = tmp_path / "site"
    render_playoffs(bracket, output_dir)

    html = (output_dir / "playoffit.html").read_text(encoding="utf-8")
    assert "Western-konferenssi" in html
    assert "COL" in html and "NSH" in html
    assert "Villikortti 2" in html
    assert html.count("matchup-card") == 4
    assert html.count("bracket-connector") == 2
    assert "Ottelun 1 voittaja" not in html
    assert "Stanley Cup" not in html


def test_static_assets_are_cache_busted_with_a_content_hash(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_site([], output_dir)

    html = (output_dir / "index.html").read_text(encoding="utf-8")
    match = re.search(r'style\.css\?v=([a-f0-9]{10})', html)
    assert match, "expected a versioned style.css link"
    assert f'app.js?v={match.group(1)}' in html


def test_render_league_stats_writes_skaters_and_goalies_tables(tmp_path: Path):
    from morning_hockey.league_stats import GoalieStatRow, SkaterStatRow
    from morning_hockey.render import render_league_stats

    skater = SkaterStatRow(
        player_id=8478402,
        name="Connor McDavid",
        team="EDM",
        logo="https://assets.nhle.com/logos/nhl/svg/EDM_light.svg",
        headshot="https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png",
        nationality="CAN",
        position="C",
        games_played=1,
        goals=1,
        assists=2,
        points=3,
    )
    goalie = GoalieStatRow(
        player_id=8480280,
        name="Jeremy Swayman",
        team="CHI",
        logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
        headshot="https://assets.nhle.com/mugs/nhl/20262027/CHI/8480280.png",
        nationality="FIN",
        games_played=10,
        wins=7,
        losses=2,
        ot_losses=1,
        goals_against_average=2.15,
        save_pct=0.925,
        shutouts=1,
    )

    output_dir = tmp_path / "site"
    render_league_stats([skater], [goalie], 20262027, output_dir)

    html = (output_dir / "tilastot.html").read_text(encoding="utf-8")
    assert "Connor McDavid" in html
    assert "Jeremy Swayman" in html
    assert html.count('data-sort="rank"') == 2
    assert "0.925" in html
    assert "🇨🇦" in html
    # goalie row is both Finnish and on Chicago
    assert 'class="row-fin row-chi"' in html
