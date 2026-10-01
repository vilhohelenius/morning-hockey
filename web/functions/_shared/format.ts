// Small formatting helpers mirroring src/morning_hockey/formatting.py's
// short_date so page output reads the same as the existing Jinja2 site.

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
    <button type="submit" class="hero-fav-star${isFavorite ? " is-fav" : ""}" aria-pressed="${isFavorite}" aria-label="${isFavorite ? "Poista suosikeista" : "Lisää suosikkeihin"}">★</button>
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

export function nationalityFlag(code: string): string {
  const iso2 = NATIONALITY_TO_ISO2[code] ?? "";
  if (iso2.length !== 2) return "";
  return [...iso2].map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("");
}

const FINAL_TYPES: Record<string, string> = { OT: "Jatkoaika", SO: "Voittolaukaukset" };

export function finalTypeFi(code: string): string {
  return FINAL_TYPES[code] ?? code;
}

const DECISIONS: Record<string, string> = { W: "voitto", L: "tappio" };

export function decisionFi(code: string): string {
  return DECISIONS[code] ?? code;
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
