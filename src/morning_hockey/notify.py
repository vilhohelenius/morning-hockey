"""Send the nightly ntfy push notification (https://docs.ntfy.sh/publish/)."""
from __future__ import annotations

import requests

from .models import Digest


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
