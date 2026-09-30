"""Small Finnish-language display helpers, kept locale-independent
since CI runners don't have the fi_FI locale installed."""
from __future__ import annotations

import datetime as dt

_WEEKDAYS = [
    "maanantai", "tiistai", "keskiviikko", "torstai",
    "perjantai", "lauantai", "sunnuntai",
]

_DECISIONS = {"W": "voitto", "L": "tappio"}

_FINAL_TYPES = {"OT": "Jatkoaika", "SO": "Voittolaukaukset"}


def human_date(date_str: str) -> str:
    date = dt.date.fromisoformat(date_str)
    weekday = _WEEKDAYS[date.weekday()]
    return f"{weekday} {date.day}.{date.month}.{date.year}"


def translate_decision(code: str | None) -> str:
    if not code:
        return ""
    return _DECISIONS.get(code, code)


def translate_final_type(code: str) -> str:
    return _FINAL_TYPES.get(code, code)


def season_label(season_id: int) -> str:
    start_year, end_year = divmod(season_id, 10_000)
    return f"{start_year}–{end_year}"
