from morning_hockey.models import GoalieLine, ScorerLine, TeamInfo
from morning_hockey.notify import team_recap_text
from morning_hockey.team_recap import TeamRecap


def test_team_recap_text_includes_score_scorers_and_goalie():
    recap = TeamRecap(
        team=TeamInfo(abbrev="CHI", name="Blackhawks", logo="chi.svg", score=2),
        opponent=TeamInfo(abbrev="VGK", name="Golden Knights", logo="vgk.svg", score=5),
        is_home=False,
        final_type="OT",
        scorers=[ScorerLine(name="Patrick Kane", team="CHI", goals=1, assists=0)],
        goalies=[
            GoalieLine(
                name="Spencer Knight",
                team="CHI",
                decision="L",
                saves=30,
                shots_against=35,
                save_pct=None,
                toi="60:00",
            )
        ],
    )

    text = team_recap_text(recap)

    assert "CHI 2 – 5 VGK (OT)" in text
    assert "Patrick Kane: 1+0" in text
    assert "Spencer Knight: 30/35 · L" in text


def test_team_recap_text_notes_when_nothing_recorded():
    recap = TeamRecap(
        team=TeamInfo(abbrev="CHI", name="Blackhawks", logo="chi.svg", score=1),
        opponent=TeamInfo(abbrev="VGK", name="Golden Knights", logo="vgk.svg", score=0),
        is_home=True,
        final_type="REG",
        scorers=[],
        goalies=[],
    )

    text = team_recap_text(recap)

    assert "Ei tilastoituja pisteitä tai torjuntoja." in text
