// Small formatting helpers mirroring src/morning_hockey/formatting.py's
// short_date so page output reads the same as the existing Jinja2 site.

export function shortDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day}.${month}.`;
}

export function seasonLabel(seasonId: number): string {
  const startYear = Math.floor(seasonId / 10_000);
  const endYear = seasonId % 10_000;
  return `${startYear}–${endYear}`;
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
