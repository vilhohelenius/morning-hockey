import re
from pathlib import Path

from morning_hockey.render import (
    render_archive_pages,
    render_dashboard,
    render_game_reports,
    render_rookies,
    render_standings,
    render_suomiporssi,
    render_team_page,
)
from morning_hockey.suomiporssi import GoalieLeaderboardRow, LeaderboardRow
from morning_hockey.league_stats import SkaterStatRow
from morning_hockey.models import TeamInfo
from morning_hockey.standings import Conference, Division, StandingsPage, StandingsRow
from morning_hockey.team import DivisionRow, RosterSkater, ScheduleGame, TeamPage

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


def test_render_archive_pages_writes_night_and_arkisto(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_archive_pages([DIGEST], output_dir)

    assert (output_dir / "style.css").exists()
    assert (output_dir / "app.js").exists()
    assert (output_dir / "arkisto.html").exists()
    assert (output_dir / "nights" / "2026-09-29.html").exists()
    assert not (output_dir / "index.html").exists()

    night_html = (output_dir / "nights" / "2026-09-29.html").read_text(encoding="utf-8")
    assert "Sebastian Aho" in night_html
    assert "FLA" in night_html and "CAR" in night_html
    assert 'href="../arkisto.html"' in night_html

    archive_html = (output_dir / "arkisto.html").read_text(encoding="utf-8")
    assert "1 ottelua" in archive_html
    assert 'href="nights/2026-09-29.html"' in archive_html


def test_render_archive_pages_handles_empty_archive(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_archive_pages([], output_dir)

    assert (output_dir / "arkisto.html").exists()
    assert not (output_dir / "index.html").exists()


DIGEST_WITH_BOX_SCORE = {
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
            "box_score": {
                "goals": [
                    {
                        "period_label": "1. erä",
                        "time_in_period": "05:00",
                        "team_abbrev": "FLA",
                        "scorer": "Carter Verhaeghe",
                        "assists": [],
                        "strength": "",
                    }
                ],
                "team_stats": [
                    {"label": "Laukaukset", "away_value": "20", "home_value": "15"},
                ],
            },
        },
        {
            "game_id": 2026020002,
            "away": {"abbrev": "BOS", "name": "Bruins", "logo": "https://example.com/bos.svg", "score": 2},
            "home": {"abbrev": "TOR", "name": "Maple Leafs", "logo": "https://example.com/tor.svg", "score": 4},
            "final_type": "REG",
            "scorers": [],
            "goalies": [],
            "box_score": None,
        },
    ],
}


def test_render_archive_pages_embeds_game_details_json_for_games_with_a_box_score(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_archive_pages([DIGEST_WITH_BOX_SCORE], output_dir)

    html = (output_dir / "nights" / "2026-09-29.html").read_text(encoding="utf-8")
    assert 'id="game-details"' in html
    assert "Carter Verhaeghe" in html
    # game 2's box_score is None -- it must not appear as a key at all
    assert "2026020002" not in html.split('id="game-details"')[1]


def test_render_archive_pages_game_details_is_empty_object_for_older_digests(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_archive_pages([DIGEST], output_dir)

    html = (output_dir / "nights" / "2026-09-29.html").read_text(encoding="utf-8")
    assert '<script id="game-details" type="application/json">{}</script>' in html


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
        season_stats=None,
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
                plus_minus=1,
                avg_toi_seconds=900.0,
                avg_toi="15:00",
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


def test_render_team_page_links_only_recent_games_with_a_report(tmp_path: Path):
    output_dir = tmp_path / "site"
    team = TeamPage(
        abbrev="CHI",
        name="Chicago Blackhawks",
        logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
        division_name="Central",
        division_rank=2,
        streak="L1",
        division_table=[],
        season_stats=None,
        skaters=[],
        goalies=[],
        recent_games=[
            ScheduleGame(
                game_id=1,
                date="2026-09-29",
                is_home=False,
                opponent_abbrev="VGK",
                opponent_name="Golden Knights",
                opponent_logo="https://assets.nhle.com/logos/nhl/svg/VGK_light.svg",
                team_score=2,
                opponent_score=5,
                final_type="REG",
                result="L",
            ),
            ScheduleGame(
                game_id=2,
                date="2026-09-27",
                is_home=True,
                opponent_abbrev="DAL",
                opponent_name="Stars",
                opponent_logo="https://assets.nhle.com/logos/nhl/svg/DAL_light.svg",
                team_score=3,
                opponent_score=1,
                final_type="REG",
                result="W",
            ),
        ],
        upcoming_games=[],
    )

    # only game 1 got a successful report -- game 2's row must stay a plain,
    # unlinked div rather than point at a page that was never written
    render_team_page(team, output_dir, report_game_ids=frozenset({1}))

    html = (output_dir / "joukkueet" / "chi.html").read_text(encoding="utf-8")
    assert 'href="../ottelut/1.html"' in html
    assert 'href="../ottelut/2.html"' not in html


def test_render_game_reports_writes_one_page_per_game(tmp_path: Path):
    from morning_hockey.game_report import GameReportPage
    from morning_hockey.models import GoalEvent, TeamStatRow

    reports = [
        GameReportPage(
            game_id=2026020001,
            date="2026-09-29",
            away=TeamInfo(abbrev="FLA", name="Florida Panthers", logo="fla.svg", score=1),
            home=TeamInfo(abbrev="CHI", name="Chicago Blackhawks", logo="chi.svg", score=3),
            final_type="REG",
            goals=[
                GoalEvent(
                    period_label="1. erä",
                    time_in_period="05:00",
                    team_abbrev="CHI",
                    scorer="Tyler Bertuzzi",
                    assists=["Connor Bedard"],
                    strength="",
                    away_score=0,
                    home_score=1,
                )
            ],
            team_stats=[TeamStatRow(label="Laukaukset", away_value="20", home_value="30")],
            away_skaters=[],
            home_skaters=[],
            away_goalies=[],
            home_goalies=[],
        )
    ]

    output_dir = tmp_path / "site"
    render_game_reports(reports, "CHI", output_dir)

    html = (output_dir / "ottelut" / "2026020001.html").read_text(encoding="utf-8")
    assert "Tyler Bertuzzi" in html
    assert "Connor Bedard" in html
    assert "FLA" in html and "CHI" in html


def test_render_rookies_writes_the_page(tmp_path: Path):
    output_dir = tmp_path / "site"
    rookies = [
        SkaterStatRow(
            player_id=1,
            name="Rookie One",
            team="CHI",
            logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
            headshot="https://assets.nhle.com/mugs/nhl/20262027/CHI/1.png",
            nationality="USA",
            position="C",
            games_played=5,
            goals=3,
            assists=4,
            points=7,
        )
    ]

    render_rookies(rookies, 20262027, output_dir)

    html = (output_dir / "rookiet.html").read_text(encoding="utf-8")
    assert "Rookie One" in html
    assert "2026" in html and "2027" in html


def test_render_rookies_handles_no_rookies_yet(tmp_path: Path):
    output_dir = tmp_path / "site"

    render_rookies([], 20262027, output_dir)

    html = (output_dir / "rookiet.html").read_text(encoding="utf-8")
    assert "Ei vielä tilastoituja rookieita" in html


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

    from morning_hockey.team import ScheduleGame
    from morning_hockey.team_snapshot import RecentResult, SnapshotGoalie, TeamSnapshot, TopScorer

    snapshots = {
        "CHI": TeamSnapshot(
            abbrev="CHI",
            recent_results=[RecentResult(result="W", opponent_abbrev="NSH")],
            top_scorers=[
                TopScorer(
                    name="Tyler Bertuzzi",
                    headshot="https://assets.nhle.com/mugs/nhl/20262027/CHI/1.png",
                    goals=2,
                    assists=1,
                    points=3,
                )
            ],
            starting_goalie=SnapshotGoalie(
                name="Spencer Knight",
                headshot="https://assets.nhle.com/mugs/nhl/20262027/CHI/2.png",
                games_played=5,
                save_pct=0.912,
            ),
            next_game=ScheduleGame(
                game_id=2,
                date="2026-10-01",
                is_home=True,
                opponent_abbrev="UTA",
                opponent_name="Mammoth",
                opponent_logo="https://assets.nhle.com/logos/nhl/svg/UTA_light.svg",
                team_score=None,
                opponent_score=None,
                final_type=None,
                result=None,
            ),
        )
    }

    render_standings(page, snapshots, output_dir)

    html = (output_dir / "sarjataulukko.html").read_text(encoding="utf-8")
    assert "Central" in html
    assert "CHI" in html
    assert "Western-konferenssi" in html
    assert "NSH" in html
    # legend dot + one qualified row in the division + one in the wildcard race
    assert html.count("playoff-dot") == 3
    assert 'data-team-abbrev="CHI"' in html
    assert 'data-team-name="Blackhawks"' in html
    assert "Tyler Bertuzzi" in html
    assert "Spencer Knight" in html
    assert '"opponent_abbrev": "UTA"' in html
    assert "team-panel" not in html  # old fixed-panel markup is gone


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
    render_archive_pages([], output_dir)

    empty_team = TeamPage(
        abbrev="CHI",
        name="Chicago Blackhawks",
        logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
        division_name="Central",
        division_rank=1,
        streak="",
        division_table=[],
        season_stats=None,
        skaters=[],
        goalies=[],
        recent_games=[],
        upcoming_games=[],
    )
    render_dashboard([], [], [], empty_team, output_dir)

    html = (output_dir / "index.html").read_text(encoding="utf-8")
    match = re.search(r'style\.css\?v=([a-f0-9]{10})', html)
    assert match, "expected a versioned style.css link"
    assert f'app.js?v={match.group(1)}' in html


def test_render_primetime_writes_games_with_finnish_times(tmp_path: Path):
    import datetime as dt

    from morning_hockey.primetime import HELSINKI, PrimeTimeGame, PrimeTimePage
    from morning_hockey.render import render_primetime

    page = PrimeTimePage(
        as_of_date="2026-01-15",
        games=[
            PrimeTimeGame(
                game_id=1,
                away=TeamInfo(abbrev="BOS", name="Bruins", logo="bos.svg", score=0),
                home=TeamInfo(abbrev="NYR", name="Rangers", logo="nyr.svg", score=0),
                start_local=dt.datetime(2026, 1, 15, 20, 0, tzinfo=HELSINKI),
                game_state="FUT",
                is_finished=False,
            )
        ],
    )

    output_dir = tmp_path / "site"
    render_primetime(page, output_dir)

    html = (output_dir / "primetime.html").read_text(encoding="utf-8")
    assert "BOS" in html and "NYR" in html
    assert "20:00" in html


def test_render_schedule_writes_a_day_picker_and_every_days_games(tmp_path: Path):
    import datetime as dt

    from morning_hockey.render import render_schedule
    from morning_hockey.schedule import HELSINKI, ScheduleDay, ScheduleGame, SchedulePage

    page = SchedulePage(
        as_of_date="2026-01-15",
        days=[
            ScheduleDay(
                date="2026-01-15",
                games=[
                    ScheduleGame(
                        game_id=1,
                        away=TeamInfo(abbrev="BOS", name="Bruins", logo="bos.svg", score=0),
                        home=TeamInfo(abbrev="NYR", name="Rangers", logo="nyr.svg", score=0),
                        start_local=dt.datetime(2026, 1, 15, 20, 0, tzinfo=HELSINKI),
                        game_state="FUT",
                        is_finished=False,
                    )
                ],
            ),
            ScheduleDay(date="2026-01-16", games=[]),
        ],
    )

    output_dir = tmp_path / "site"
    render_schedule(page, output_dir)

    html = (output_dir / "otteluohjelma.html").read_text(encoding="utf-8")
    assert "BOS" in html and "NYR" in html
    assert "20:00" in html
    assert 'data-date="2026-01-15"' in html
    assert 'data-date="2026-01-16"' in html
    assert "Ei otteluita tänä päivänä." in html


def test_render_league_stats_and_goalie_stats_write_separate_pages(tmp_path: Path):
    from morning_hockey.league_stats import GoalieStatRow, SkaterStatRow
    from morning_hockey.render import render_goalie_stats, render_league_stats

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
    render_league_stats([skater], 20262027, output_dir)
    render_goalie_stats([goalie], 20262027, output_dir)

    skaters_html = (output_dir / "tilastot.html").read_text(encoding="utf-8")
    assert "Connor McDavid" in skaters_html
    assert "Jeremy Swayman" not in skaters_html

    goalies_html = (output_dir / "maalivahtiporssi.html").read_text(encoding="utf-8")
    assert "Jeremy Swayman" in goalies_html
    assert "Connor McDavid" not in goalies_html
    assert "0.925" in goalies_html
    assert "🇨🇦" in skaters_html
    # goalie row is both Finnish and on Chicago
    assert 'class="row-fin row-chi"' in goalies_html


def test_render_dashboard_shows_latest_night_and_top5_previews(tmp_path: Path):
    output_dir = tmp_path / "site"
    fin_skaters = [
        LeaderboardRow(
            player_id=1,
            name="Sebastian Aho",
            team="CAR",
            logo="https://assets.nhle.com/logos/nhl/svg/CAR_light.svg",
            headshot="https://assets.nhle.com/mugs/nhl/20262027/CAR/1.png",
            position="C",
            games_played=1,
            goals=1,
            assists=2,
            points=3,
        )
    ]
    league_skaters = [
        SkaterStatRow(
            player_id=2,
            name="Connor McDavid",
            team="EDM",
            logo="https://assets.nhle.com/logos/nhl/svg/EDM_light.svg",
            headshot="https://assets.nhle.com/mugs/nhl/20262027/EDM/2.png",
            nationality="CAN",
            position="C",
            games_played=1,
            goals=2,
            assists=1,
            points=3,
        )
    ]
    team = TeamPage(
        abbrev="CHI",
        name="Chicago Blackhawks",
        logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
        division_name="Central",
        division_rank=8,
        streak="L1",
        division_table=[],
        season_stats=None,
        skaters=[],
        goalies=[],
        recent_games=[
            ScheduleGame(
                game_id=1,
                date="2026-09-29",
                is_home=False,
                opponent_abbrev="VGK",
                opponent_name="Golden Knights",
                opponent_logo="https://assets.nhle.com/logos/nhl/svg/VGK_light.svg",
                team_score=2,
                opponent_score=5,
                final_type="REG",
                result="L",
            )
        ],
        upcoming_games=[
            ScheduleGame(
                game_id=2,
                date="2026-10-01",
                is_home=True,
                opponent_abbrev="UTA",
                opponent_name="Mammoth",
                opponent_logo="https://assets.nhle.com/logos/nhl/svg/UTA_light.svg",
                team_score=None,
                opponent_score=None,
                final_type=None,
                result=None,
            )
        ],
    )

    render_dashboard([DIGEST], fin_skaters, league_skaters, team, output_dir)

    html = (output_dir / "index.html").read_text(encoding="utf-8")
    assert "Sebastian Aho" in html  # last night's Finnish scorer, also the Suomipörssi top-5 row
    assert "Connor McDavid" in html  # league top-5 row
    assert "Chicago Blackhawks" in html
    assert "Central: 8. sija" in html
    assert "VGK" in html and "UTA" in html
    assert 'href="suomiporssi.html"' in html
    assert 'href="tilastot.html"' in html
    assert 'href="joukkueet/chi.html"' in html


def test_render_dashboard_embeds_game_details_json_for_the_latest_night(tmp_path: Path):
    output_dir = tmp_path / "site"
    team = TeamPage(
        abbrev="CHI",
        name="Chicago Blackhawks",
        logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
        division_name="Central",
        division_rank=1,
        streak="",
        division_table=[],
        season_stats=None,
        skaters=[],
        goalies=[],
        recent_games=[],
        upcoming_games=[],
    )

    render_dashboard([DIGEST_WITH_BOX_SCORE], [], [], team, output_dir)

    html = (output_dir / "index.html").read_text(encoding="utf-8")
    assert 'id="game-details"' in html
    assert "Carter Verhaeghe" in html


def test_render_dashboard_handles_no_archive_yet(tmp_path: Path):
    output_dir = tmp_path / "site"
    team = TeamPage(
        abbrev="CHI",
        name="Chicago Blackhawks",
        logo="https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
        division_name="Central",
        division_rank=1,
        streak="",
        division_table=[],
        season_stats=None,
        skaters=[],
        goalies=[],
        recent_games=[],
        upcoming_games=[],
    )

    render_dashboard([], [], [], team, output_dir)

    html = (output_dir / "index.html").read_text(encoding="utf-8")
    assert "Ei vielä otteluita arkistossa" in html
    assert "Ei tilastoituja suomalaispelaajia" in html
