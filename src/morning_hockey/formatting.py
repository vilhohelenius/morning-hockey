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

# NHL's nationalityCode is a 3-letter code; flag emoji need the 2-letter
# ISO 3166-1 equivalent. Only the countries that actually show up among NHL
# players are mapped — an unmapped code just falls back to no flag.
_NATIONALITY_TO_ISO2 = {
    "CAN": "CA", "USA": "US", "SWE": "SE", "FIN": "FI", "RUS": "RU",
    "CZE": "CZ", "SVK": "SK", "CHE": "CH", "DEU": "DE", "DNK": "DK",
    "NOR": "NO", "AUT": "AT", "LVA": "LV", "SVN": "SI", "FRA": "FR",
    "GBR": "GB", "AUS": "AU", "BLR": "BY", "UKR": "UA", "POL": "PL",
    "ITA": "IT", "JPN": "JP", "KAZ": "KZ", "HUN": "HU", "KOR": "KR",
    "NLD": "NL", "BEL": "BE", "ESP": "ES", "IRL": "IE", "NZL": "NZ",
}


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


def short_date(date_str: str) -> str:
    date = dt.date.fromisoformat(date_str)
    return f"{date.day}.{date.month}."


def season_label(season_id: int) -> str:
    start_year, end_year = divmod(season_id, 10_000)
    return f"{start_year}–{end_year}"


def nationality_flag(code: str) -> str:
    iso2 = _NATIONALITY_TO_ISO2.get(code, "")
    if len(iso2) != 2:
        return ""
    return "".join(chr(0x1F1E6 + ord(letter) - ord("A")) for letter in iso2)
