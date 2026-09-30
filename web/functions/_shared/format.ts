// Small formatting helpers mirroring src/morning_hockey/formatting.py's
// short_date so page output reads the same as the existing Jinja2 site.

export function shortDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day}.${month}.`;
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
