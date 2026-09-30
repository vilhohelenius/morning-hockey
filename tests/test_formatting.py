from morning_hockey.formatting import (
    human_date,
    nationality_flag,
    short_weekday_date,
    translate_decision,
    translate_final_type,
)


def test_human_date_uses_finnish_weekday_names():
    assert human_date("2026-09-29") == "Tiistai 29.9.2026"


def test_short_weekday_date_uses_lowercase_weekday_abbreviation():
    assert short_weekday_date("2026-10-01") == "to 1.10."


def test_translate_decision():
    assert translate_decision("W") == "voitto"
    assert translate_decision("L") == "tappio"
    assert translate_decision(None) == ""


def test_translate_final_type_passes_through_unknown_codes():
    assert translate_final_type("OT") == "Jatkoaika"
    assert translate_final_type("SO") == "Voittolaukaukset"
    assert translate_final_type("REG") == "REG"


def test_nationality_flag_builds_regional_indicator_emoji():
    assert nationality_flag("FIN") == "🇫🇮"
    assert nationality_flag("CAN") == "🇨🇦"


def test_nationality_flag_falls_back_to_empty_for_unmapped_codes():
    assert nationality_flag("XYZ") == ""
