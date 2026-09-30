"""Send the nightly ntfy push notification (https://docs.ntfy.sh/publish/)."""
from __future__ import annotations

import requests

from .models import Digest
from .team_recap import TeamRecap


def summary_text(digest: Digest) -> str:
    lines: list[str] = []
    for game in digest.games:
        tag = f" ({game.final_type})" if game.final_type != "REG" else ""
        lines.append(f"{game.away.abbrev} {game.away.score} – {game.home.score} {game.home.abbrev}{tag}")
        for scorer in game.scorers:
            lines.append(f"  \U0001F1EB\U0001F1EE {scorer.name}: {scorer.line}")
        for goalie in game.goalies:
            decision = f" · {goalie.decision}" if goalie.decision else ""
            lines.append(f"  \U0001F945 {goalie.name}: {goalie.saves}/{goalie.shots_against}{decision}")
    return "\n".join(lines) if lines else "Ei suomalaisia pisteentekijöitä tai maalivahteja viime yönä."


def send_ntfy(digest: Digest, page_url: str, topic: str, server: str = "https://ntfy.sh") -> None:
    if not digest.games:
        return

    payload = {
        "topic": topic,
        "title": f"NHL-yö: {len(digest.games)} ottelua",
        "message": summary_text(digest),
        "click": page_url,
        "tags": ["ice_hockey"],
    }
    response = requests.post(server.rstrip("/"), json=payload, timeout=15)
    response.raise_for_status()


def team_recap_text(recap: TeamRecap) -> str:
    tag = f" ({recap.final_type})" if recap.final_type != "REG" else ""
    lines = [f"{recap.team.abbrev} {recap.team.score} – {recap.opponent.score} {recap.opponent.abbrev}{tag}"]
    for scorer in recap.scorers:
        lines.append(f"  {scorer.name}: {scorer.line}")
    for goalie in recap.goalies:
        decision = f" · {goalie.decision}" if goalie.decision else ""
        lines.append(f"  \U0001F945 {goalie.name}: {goalie.saves}/{goalie.shots_against}{decision}")
    if not recap.scorers and not recap.goalies:
        lines.append("Ei tilastoituja pisteitä tai torjuntoja.")
    return "\n".join(lines)


def send_team_recap(recap: TeamRecap, page_url: str, topic: str, server: str = "https://ntfy.sh") -> None:
    matchup = f"vs {recap.opponent.abbrev}" if recap.is_home else f"@ {recap.opponent.abbrev}"
    payload = {
        "topic": topic,
        "title": f"{recap.team.name} {matchup}: {recap.team.score}–{recap.opponent.score}",
        "message": team_recap_text(recap),
        "click": page_url,
        "tags": ["ice_hockey"],
    }
    response = requests.post(server.rstrip("/"), json=payload, timeout=15)
    response.raise_for_status()
