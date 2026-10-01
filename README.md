# Morning Hockey

NHL-tulokset, suomalaisten pelaajien pisteet/torjunnat ja kausitilastot kaikille
32 joukkueelle, selattavissa osoitteessa https://morning-hockey.pages.dev —
ei ilmoituksia, ei yhtä kovakoodattua joukkuetta, vaan oma käyttäjätili
suosikkijoukkueineen ja -pelaajineen.

## Miten se toimii

```
GitHub Actions (kolme ajastettua synkkaa)
        │
        ├─ sync-fast-tier.yml   (30 min välein)  → games-taulu
        │     ottelutilanteet/-tulokset, pysyvä arkisto samalla
        │
        ├─ sync-slow-tier.yml   (tunneittain)     → kausitilastot
        │     sarjataulukko, pistepörssit, rosterit, joukkueiden
        │     kausitilastot (kaikki 32 joukkuetta)
        │
        └─ sync-digest.yml      (kerran päivässä) → suomalaiset pelaajat
              edellisen yön suomalaisten syöttö-/maalivahtirivit

Cloudflare D1 (SQLite)
        │
        └─ Cloudflare Pages Functions (web/) lukee D1:stä per-pyyntö
           ja renderöi HTML:n -- ei staattista build-vaihetta sivuston
           puolella, data on aina niin tuore kuin viimeisin synkka
```

Data haetaan [NHL:n julkisesta API:sta](https://github.com/Zmalski/NHL-API-Reference).
Python (`src/morning_hockey/`) hoitaa vain datan haun ja jalostuksen; jokainen
`sync_*.py`-skripti kutsuu valmiita `build_*`-funktioita ja kirjoittaa
tuloksen D1:een `d1_sync.py`:n kautta. Itse sivusto on TypeScript/Cloudflare
Pages Functions (`web/functions/`), joka lukee D1:tä suoraan Workersin omalla
bindingillä -- ei erillistä build-vaihetta, jokainen sivulataus on tuore.

## Projektin rakenne

```
src/morning_hockey/
  nhl_api.py          NHL API -asiakas (score/boxscore/roster-endpointit, cachettaa per-ajo)
  d1_sync.py           D1:n HTTP API -kirjoitusadapteri jokaiselle synkalle
  digest.py            Edellisen yön tulokset + suomalaiset pelaajat
  finnish.py            Suomalaisten pelaajien tunnistus rosterdatasta
  boxscore.py           Yksittäisen ottelun maali-/tilastoerittely
  league_stats.py       Liigan pistepörssi/maalivahtipörssi (top-N)
  rookies.py             Rookie-pörssi (NHL:n virallinen rookie-sääntö)
  standings.py            Sarjataulukko divisioonittain
  suomiporssi.py          Suomalaisten oma pistepörssi/maalivahtipörssi
  schedule.py             Otteluohjelma (rullaava 7+ päivää)
  team.py                 Joukkueiden rosterit + kausitilastot, kaikille 32
  sync_fast_tier.py       CLI: ottelut → D1 (30 min välein)
  sync_slow_tier.py       CLI: kausitilastot → D1 (tunneittain)
  sync_digest.py          CLI: edellisen yön suomalaiset → D1 (päivittäin)

web/
  functions/            Cloudflare Pages Functions (TypeScript), yksi
                         reitti/tiedosto per sivu, lukee env.DB:tä (D1)
  functions/_shared/     Layout, muotoilu, autentikaatio, jaetut komponentit
  public/static/         CSS + vanilla JS (app.js), ei build-stepiä
  wrangler.toml           Pages-projektin D1-binding
  seed.local.sql          Paikallinen testidata (wrangler pages dev)

d1/schema.sql          D1:n taulurakenne (ei ajeta automaattisesti --
                        uudet taulut/indeksit liitetään käsin Cloudflaren
                        D1 Console -välilehdellä)
tests/                 Pytest-yksikkötestit Python-puolelle
.github/workflows/
  sync-fast-tier.yml    Ottelut D1:een, 30 min välein
  sync-slow-tier.yml    Kausitilastot D1:een, tunneittain
  sync-digest.yml       Suomalaiset pelaajat D1:een, kerran päivässä
  deploy-pages.yml       web/ → Cloudflare Pages jokaisella pushilla mainiin
  web-typecheck.yml      tsc + boxscore-parity-testit jokaisella web/-pushilla
  tests.yml               pytest jokaisella pushilla/PR:llä
```

## Käyttöönotto

1. **Luo Cloudflare-tili ja D1-tietokanta**, aja `d1/schema.sql` sen
   konsolissa (taulu/indeksi kerrallaan -- D1 Console ei tue
   multi-statement-erää).
2. **Aseta GitHub-secretit** (Settings → Secrets and variables → Actions):
   `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_API_TOKEN` (oikeudet: D1 edit +
   Cloudflare Pages edit).
3. **Aja synkat kerran käsin** (Actions-välilehti → kukin
   `Sync *-tier to D1` -workflow → Run workflow), niin D1:ssä on dataa
   ennen ensimmäistä sivulatausta.
4. **Pushaa `web/`-hakemistoon** — `deploy-pages.yml` luo Cloudflare
   Pages -projektin automaattisesti ensimmäisellä ajolla ja julkaisee sen.

## Ajaminen paikallisesti

```bash
# Python-synkat
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest

CF_ACCOUNT_ID=... CF_D1_DATABASE_ID=... CF_API_TOKEN=... \
  python -m morning_hockey.sync_fast_tier

# Web-sovellus
cd web
npm install
npm run typecheck && npm test
npx wrangler d1 execute DB --local --file=../d1/schema.sql
npx wrangler d1 execute DB --local --file=seed.local.sql
npx wrangler pages dev public
```

## Ajastuksen muuttaminen

Cron-lausekkeet ovat UTC-aikaa, kolmessa erillisessä workflow-tiedostossa
(`.github/workflows/sync-{fast,slow,digest}-tier.yml`). Jokaista voi myös
laukaista käsin milloin vain: Actions-välilehti → valitse synkka → *Run
workflow*.
