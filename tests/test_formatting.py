from morning_hockey.formatting import human_date, translate_decision, translate_final_type


def test_human_date_uses_finnish_weekday_names():
    assert human_date("2026-09-29") == "tiistai 29.9.2026"


def test_translate_decision():
    assert translate_decision("W") == "voitto"
    assert translate_decision("L") == "tappio"
    assert translate_decision(None) == ""


def test_translate_final_type_passes_through_unknown_codes():
    assert translate_final_type("OT") == "Jatkoaika"
    assert translate_final_type("SO") == "Voittolaukaukset"
    assert translate_final_type("REG") == "REG"
