// Small formatting helpers mirroring src/morning_hockey/formatting.py's
// short_date so page output reads the same as the existing Jinja2 site.

import type { GameRow } from "./types";

export function formatToi(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function shortDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day}.${month}.`;
}

export function seasonLabel(seasonId: number): string {
  const startYear = Math.floor(seasonId / 10_000);
  const endYear = seasonId % 10_000;
  return `${startYear}–${endYear}`;
}

// Same CDN path NHL.com itself serves team logos from -- no API call or D1
// join needed, just the abbreviation, which every row that needs this
// already carries even when (unlike standings_rows/team_roster_*) it
// doesn't carry a `logo` column of its own.
export function teamLogoUrl(abbrev: string): string {
  return `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`;
}

// The header background NHL.com's own player pages use behind the
// headshot -- confirmed via live DOM inspection of nhl.com, not guessed:
// a darkening vignette, the team's "wires" crest (an outline-style
// secondary/alternate logo, e.g. Chicago's crossed tomahawks rather than
// the primary Indian-head logo -- already team-colored and semi-
// transparent via its own SVG stroke/opacity attributes), a fade-to-black,
// and a tileable jersey-texture PNG that is itself already solid team
// color (confirmed by inspecting its pixels) -- so no separate CSS
// background-color layer is needed on top. Both asset URLs are general,
// abbrev-keyed CDN paths (verified 200 OK for several teams), same style
// as teamLogoUrl above.
// `includeCrest: false` drops the wires layer, leaving just the vignette +
// fade + jersey texture -- for a team's own pages the wires crest is the
// point, but the dashboard's non-team teasers borrow a team's background
// purely for its look, where that team's own crest doesn't belong.
//
// The vignette/fade stops below are CSS custom properties (--hero-shade-*,
// defined in style.css) rather than literal rgba()/rgb() -- this HTML is
// rendered server-side where the viewer's light/dark preference isn't known
// (data-theme is only set when the viewer has an explicit cookie override;
// otherwise it's resolved client-side from prefers-color-scheme), but a
// var() reference is just inherited text that the browser resolves at paint
// time against whichever :root block ends up active, so the same markup
// stays theme-correct either way.
export function teamHeroBackgroundStyle(abbrev: string | null | undefined, includeCrest = true): string {
  if (!abbrev) return "";
  const texture = `https://assets.nhle.com/textures/nhl/jersey/png/${abbrev}.png`;
  if (!includeCrest) {
    return [
      `background-image: radial-gradient(50% 100% at 50% 0%, rgba(0,0,0,0) 0%, var(--hero-shade-strong) 100%), linear-gradient(rgba(0,0,0,0) 0%, var(--hero-shade-fade) 100%), url("${texture}")`,
      `background-size: auto, auto, 42px 42px`,
      `background-position: 0% 0%, 0% 0%, 0% 0%`,
      `background-repeat: repeat, repeat, repeat`,
    ].join("; ");
  }
  const wires = `https://assets.nhle.com/logos/nhl/wires/${abbrev}.svg`;
  return [
    `background-image: radial-gradient(50% 100% at 50% 0%, rgba(0,0,0,0) 0%, var(--hero-shade-strong) 100%), url("${wires}"), linear-gradient(rgba(0,0,0,0) 0%, var(--hero-shade-fade) 100%), url("${texture}")`,
    `background-size: auto, 400px auto, auto, 42px 42px`,
    `background-position: 0% 0%, 50% 50%, 0% 0%, 0% 0%`,
    `background-repeat: repeat, no-repeat, repeat, repeat`,
  ].join("; ");
}

// One row of a team's schedule list, linking to that game's /ottelut/[id]
// page -- a played game shows the final score/result there, an upcoming one
// gets the preview page instead (both served by the same route). Shared by
// the team page's own (limited) recent/upcoming sections and the
// full-season schedule view (/joukkueet/[abbrev]/ottelut).
export function renderGameRow(game: GameRow, teamAbbrev: string, played: boolean): string {
  const isHome = game.home_abbrev === teamAbbrev;
  const teamScore = isHome ? game.home_score : game.away_score;
  const opponentScore = isHome ? game.away_score : game.home_score;
  const opponentAbbrev = isHome ? game.away_abbrev : game.home_abbrev;
  const opponentLogo = isHome ? game.away_logo : game.home_logo;
  const result = played ? (teamScore > opponentScore ? "W" : game.final_type !== "REG" ? "OTL" : "L") : null;

  const inner = `
      <span class="schedule-date">${shortDate(game.date)}</span>
      <span class="schedule-opponent">
        ${isHome ? "vs" : "@"}
        <img src="${escapeHtml(opponentLogo)}" alt="${escapeHtml(opponentAbbrev)}" class="schedule-logo" loading="lazy">
        ${escapeHtml(opponentAbbrev)}
      </span>
      ${
        played
          ? `<span class="schedule-score">${teamScore}–${opponentScore}</span>
      <span class="schedule-result result-${result?.toLowerCase()}">${result}</span>`
          : `<span class="schedule-time">${(() => {
              const { hour, minute } = helsinkiParts(game.start_time_utc);
              return `${hour}:${String(minute).padStart(2, "0")}`;
            })()}</span>`
      }`;

  return `<a class="schedule-row schedule-row-link" href="/ottelut/${game.game_id}">${inner}</a>`;
}

// The star-shaped favorite toggle in a hero banner's top-right corner
// (player/team pages). A plain form (works with no JS, redirecting back to
// redirectTo via the POST handler's redirect_to field) that app.js
// progressively enhances into an instant, no-navigation toggle -- same
// add/remove POST targets /omat's own favorite forms already use, just
// pointed back at the current page instead of always at /omat.
export function renderFavStar(options: {
  formAction: string;
  hiddenFields: Record<string, string>;
  isFavorite: boolean;
  redirectTo: string;
}): string {
  const { formAction, hiddenFields, isFavorite, redirectTo } = options;
  const hidden = Object.entries(hiddenFields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  return `
  <form method="post" action="${escapeHtml(formAction)}" class="hero-fav-form" data-fav-toggle>
    ${hidden}
    <!-- Named "fav_action", not "action": a form field literally named
         "action" shadows HTMLFormElement's own .action property, which
         broke app.js's fetch(form.action, ...) (it silently fetched the
         input *element*, stringified, instead of the URL). -->
    <input type="hidden" name="fav_action" value="${isFavorite ? "remove" : "add"}">
    <input type="hidden" name="redirect_to" value="${escapeHtml(redirectTo)}">
    <button type="submit" class="hero-fav-star${isFavorite ? " is-fav" : ""}" aria-pressed="${isFavorite}" aria-label="${isFavorite ? "Poista suosikeista" : "Lisää suosikkeihin"}">${icon("star")}</button>
  </form>`;
}

const WEEKDAYS = ["maanantai", "tiistai", "keskiviikko", "torstai", "perjantai", "lauantai", "sunnuntai"];

export function humanDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  const weekday = WEEKDAYS[(jsDay + 6) % 7]; // rotate to 0=Mon..6=Sun
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${day}.${month}.${year}`;
}

const WEEKDAYS_SHORT = ["ma", "ti", "ke", "to", "pe", "la", "su"];

export function shortWeekdayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = WEEKDAYS_SHORT[(jsDay + 6) % 7];
  return `${weekday} ${day}.${month}.`;
}

// Adds `days` (may be negative) to a YYYY-MM-DD calendar date. Pure date
// math in UTC -- these are calendar dates, not instants, so no timezone
// conversion belongs here.
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Europe/Helsinki-local calendar date and time-of-day for a UTC ISO
// timestamp, the same split schedule.py/primetime.py derive with zoneinfo.
// Intl.DateTimeFormat handles the DST transition itself, so this doesn't
// need a manual UTC+2/UTC+3 offset table.
export function helsinkiParts(isoUtc: string): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(isoUtc));

  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: Number(get("minute")) };
}

// Seconds until the next Helsinki midnight (DST-safe: derived from the
// current Helsinki wall-clock time, minute precision is plenty).
export function secondsToHelsinkiMidnight(now: Date = new Date()): number {
  const { hour, minute } = helsinkiParts(now.toISOString());
  return Math.max(1, (24 * 60 - (hour * 60 + minute)) * 60 - now.getUTCSeconds());
}

export function helsinkiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Mirrors formatting.py's _NATIONALITY_TO_ISO2 -- only nationality codes
// that actually show up among NHL players are mapped; an unmapped code
// just falls back to no flag.
const NATIONALITY_TO_ISO2: Record<string, string> = {
  CAN: "CA", USA: "US", SWE: "SE", FIN: "FI", RUS: "RU",
  CZE: "CZ", SVK: "SK", CHE: "CH", DEU: "DE", DNK: "DK",
  NOR: "NO", AUT: "AT", LVA: "LV", SVN: "SI", FRA: "FR",
  GBR: "GB", AUS: "AU", BLR: "BY", UKR: "UA", POL: "PL",
  ITA: "IT", JPN: "JP", KAZ: "KZ", HUN: "HU", KOR: "KR",
  NLD: "NL", BEL: "BE", ESP: "ES", IRL: "IE", NZL: "NZ",
};

// SVG flags from the MIT-licensed flag-icons set (public/static/flags/).
export function flagImg(iso2: string): string {
  return `<img src="/static/flags/${iso2.toLowerCase()}.svg" alt="" class="flag-img" loading="lazy">`;
}

export function nationalityFlag(code: string): string {
  const iso2 = NATIONALITY_TO_ISO2[code] ?? "";
  if (iso2.length !== 2) return "";
  return flagImg(iso2);
}

const FINAL_TYPES: Record<string, string> = { OT: "Jatkoaika", SO: "Voittolaukaukset" };

export function finalTypeFi(code: string): string {
  return FINAL_TYPES[code] ?? code;
}

const DECISIONS: Record<string, string> = { W: "voitto", L: "tappio" };

export function decisionFi(code: string): string {
  return DECISIONS[code] ?? code;
}

// "Aleksander Barkov" -> "A. Barkov", for compact spaces like the
// Pistepörssi points-race chart's logo-sized legend labels. skater_season_
// stats.name is stored as one combined string (first+last baked in at sync
// time, see league_stats.py), not split fields, so this just takes
// everything up to the last space as the first name and initials it --
// fragile for multi-word surnames (would read "A. Jong" not "A. de Jong"),
// but no such NHL player exists today and the fallback (full name) is used
// whenever a name has no space at all.
export function abbreviatedName(fullName: string): string {
  const lastSpace = fullName.trim().lastIndexOf(" ");
  if (lastSpace <= 0) return fullName;
  const first = fullName.slice(0, lastSpace);
  const last = fullName.slice(lastSpace + 1);
  return `${first[0]}. ${last}`;
}

// D1 rows are plain data, not markup -- escape anything interpolated into
// HTML so a stray "<"/"&" in a name (or, later, a user-entered favorite)
// can't break the page or inject markup.
export function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Inline icon from /static/icons.svg (our own drawn set, replaces the old emojis).
export function icon(name: string): string {
  return `<svg class="ic" aria-hidden="true"><use href="/static/icons.svg#i-${name}"/></svg>`;
}
