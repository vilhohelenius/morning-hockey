from pathlib import Path

from morning_hockey.render import render_site

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
