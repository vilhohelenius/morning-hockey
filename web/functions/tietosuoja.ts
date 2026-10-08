// Privacy notice. Keep in sync with what the app actually stores: users /
// sessions / favorite_* / user_settings / bingo_picks / bug_reports (d1/
// schema.sql) and the cookies set in _shared/auth.ts.

import { icon } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env } from "./_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const html = await renderLayout({
    title: "Tietosuoja · Morning Hockey",
    headerTitle: "Tietosuoja",
    activePage: "privacy",
    request: context.request,
    env: context.env,
    content: `
<a class="back-link js-back" href="/">← Takaisin</a>
<header class="page-header"><h1>${icon("key")} Tietosuojaseloste</h1></header>
<div class="prose">
<h2>Mitä tallennetaan</h2>
<p>Kirjautuminen tapahtuu Google-tilillä. Googlelta tallennetaan vain tilin tekninen tunniste (<code>sub</code>) —
ei sähköpostiosoitetta, nimeä eikä profiilikuvaa. Lisäksi tallennetaan:</p>
<ul>
  <li>valitsemasi käyttäjänimi</li>
  <li>suosikkijoukkueet ja -pelaajat, teema- ja tulospiiloasetukset, pörssien korostukset ja bingovalinnat</li>
  <li>lähettämäsi bugiraportit (viesti, käyttäjänimi, selaimen tunnistetieto)</li>
  <li>kirjautumissessio (satunnainen tunniste, vain sen tiiviste tallennetaan; voimassa 30 päivää)</li>
</ul>
<p>Kirjautumattomana mitään henkilökohtaista ei tallenneta.</p>

<h2>Evästeet</h2>
<p>Vain välttämättömät: kirjautumissessio, kirjautumisen väliaikainen tila, sekä asetukset (teema, tulospiilo,
korostukset, välimuistin versio). Ei mainos- eikä seurantaevästeitä, ei analytiikkaa.</p>

<h2>Kolmannet osapuolet</h2>
<ul>
  <li><b>Google</b>: kirjautuminen sekä Google Fonts -kirjasimet.</li>
  <li><b>Cloudflare</b>: sivuston ja tietokannan ylläpito (palvelun tavanomaiset lokit).</li>
  <li><b>NHL</b> (assets.nhle.com): joukkueiden logot ja pelaajakuvat ladataan suoraan heidän palvelimeltaan, jolloin IP-osoitteesi näkyy heille.</li>
  <li><b>YouTube</b>: highlight-linkit avaavat YouTuben.</li>
</ul>
<p>Tietoja ei myydä eikä luovuteta eteenpäin.</p>

<h2>Tietojen poisto</h2>
<p>Kirjaudu ulos Asetukset-sivulta, jolloin sessio poistetaan. Tilin ja sen tietojen poistoa voi pyytää
Asetusten bugiraportilla.</p>

<p class="standings-legend">Morning Hockey on harrasteprojekti, jolla ei ole yhteyttä NHL:ään. Tiedot: NHL.</p>
</div>`,
  });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
