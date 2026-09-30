# Morning Hockey

Joka aamu: käy automaattisesti läpi edellisen yön NHL-ottelut, ja kertoo

- lopputulokset,
- suomalaisten pelaajien pisteet (`Nimi, maalit+syötöt`, esim. `Sebastian Aho, 2+1`),
- pelanneet suomalaiset maalivahdit torjuntoineen,

joukkueiden logoineen. Tulokset julkaistaan mobiilioptimoidulla sivulla
(GitHub Pages), ja niistä lähtee push-ilmoitus [ntfy](https://ntfy.sh):n kautta
puhelimeen heti kun ilmoitus on valmis.

## Miten se toimii

```
GitHub Actions (ajastettu joka aamu)
        │
        ├─ hakee NHL:n julkisesta API:sta (api-web.nhle.com) edellisen yön
        │  tulokset, maalintekijät ja maalivahtien tilastot
        │
        ├─ suodattaa niistä suomalaiset pelaajat (roolista birthCountry == "FIN")
        │
        ├─ tallentaa yön datan JSON-tiedostoksi data/YYYY-MM-DD.json (arkisto)
        │
        ├─ renderöi koko arkiston staattiseksi sivustoksi (site/) ja julkaisee
        │  sen GitHub Pagesiin
        │
        └─ lähettää ntfy-push-ilmoituksen, joka linkittää suoraan illan sivulle
```

Data haetaan [NHL:n julkisesta API:sta](https://github.com/Zmalski/NHL-API-Reference).

## Projektin rakenne

```
src/morning_hockey/
  nhl_api.py     NHL API -asiakas (score/boxscore/roster-endpointit)
  finnish.py     Suomalaisten pelaajien tunnistus rosterdatasta
  digest.py      Raakadatan jalostus Digest-malliksi (tulokset, pisteet, torjunnat)
  formatting.py  Suomenkieliset päivämäärä-/tulos-apufunktiot
  render.py      Jinja2-pohjainen staattisen sivuston generointi
  notify.py      ntfy-ilmoituksen lähetys
  main.py        Komentorivin ajopiste, jota GitHub Actions kutsuu

templates/       Sivuston HTML-templatet (Jinja2)
static/          Sivuston CSS
data/            Arkistoidut yökohtaiset digestit (JSON, committed gitiin)
tests/           Pytest-yksikkötestit
.github/workflows/
  nightly-digest.yml   Ajastettu ajo (klo 06 UTC) + Pages-julkaisu
  tests.yml            Testit jokaisella pushilla/PR:llä
```

## Käyttöönotto

1. **Luo ntfy-tilaus puhelimeen.** Asenna [ntfy-sovellus](https://apps.apple.com/app/ntfy/id1625396347)
   iPhoneen ja tilaa aihe (topic), jonka saat tämän projektin ylläpitäjältä /
   generoit itse (pitkä, satunnainen merkkijono — kuka tahansa aiheen tietävä
   näkee ilmoitukset, joten pidä se salassa jaettavan linkin tavoin).
2. **Aseta GitHub-secret.** Repon Settings → Secrets and variables → Actions →
   New repository secret: `NTFY_TOPIC` = valitsemasi aihe.
3. **Varmista GitHub Pages -asetus.** Settings → Pages → Source: **GitHub
   Actions** (workflow tekee tämän automaattisesti ensimmäisellä ajolla, mutta
   kannattaa tarkistaa manuaalisesti jos repo on yksityinen — katso alla oleva
   huomio).
4. **Aja workflow kerran käsin** (Actions → Nightly NHL digest → Run workflow),
   niin saat heti ensimmäisen sivun ja ilmoituksen testiksi, sen sijaan että
   odottaisit seuraavaan ajastettuun aamuun.

### Huomio yksityisestä repositoriosta

GitHub Pages -sivu, joka julkaistaan yksityisestä repositoriosta, on GitHubin
ilmaistilillä oletuksena **julkisesti selattavissa ilman kirjautumista** heti
kun Pages otetaan käyttöön "GitHub Actions" -lähteellä — itse koodi ja data
pysyvät silti yksityisinä. Jos näin ei kuitenkaan ole (esim. tili on osa
organisaatiota, jolla on tiukemmat oletukset), Settings → Pages kertoo
suoraan, vaatiiko sivu kirjautumisen.

## Ajaminen paikallisesti

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

pytest

# Rakentaa data/ + site/ hakemistot ilman ntfy-ilmoitusta (NTFY_TOPIC ei asetettu):
python -m morning_hockey.main --pages-base-url "https://example.github.io/morning-hockey"

# Ilmoituksen kanssa:
NTFY_TOPIC="oma-salainen-aihe" python -m morning_hockey.main \
  --pages-base-url "https://example.github.io/morning-hockey"
```

## Ajastuksen muuttaminen

Cron-lauseke on UTC-aikaa (`.github/workflows/nightly-digest.yml`). Suomen aika
on UTC+2 (talvi) tai UTC+3 (kesä), joten `0 6 * * *` osuu noin klo 8–9 väliin.
Ajoa voi myös laukaista käsin milloin vain: Actions-välilehti → *Nightly NHL
digest* → *Run workflow*.
