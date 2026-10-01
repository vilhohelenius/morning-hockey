// Login, phase 7 -> replaced 2026-10-01. Was Cloudflare Access (email
// allow-list, verified at Cloudflare's edge); the user asked for something
// lighter to experiment with instead, explicitly not caring about its
// security since this only runs for a handful of people who already have
// the URL -- a username (password optional), created on first login,
// remembered in a long-lived cookie. Cloudflare Access can come back later
// (or real OAuth) without touching anything downstream of currentUsername(),
// since every route only ever asks "who is this, or null".
//
// The cookie holds the username in plain text, unsigned -- trivially
// spoofable by editing it in devtools. That's a deliberate, acknowledged
// trade-off for a single-digit-friends app, not an oversight.

import type { Env } from "./types";

const SESSION_COOKIE = "mh_user";
const SESSION_MAX_AGE = 10 * 365 * 24 * 60 * 60; // ~10 years: "stay logged in basically forever"

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)(?:;|$)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function currentUsername(request: Request): string | null {
  return readCookie(request, SESSION_COOKIE);
}

export function sessionCookieHeader(username: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(username)}; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax; HttpOnly`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}

// SHA-256 via Web Crypto (available natively in Workers) -- not a
// password-hashing-grade KDF (no salt/work factor), but this isn't
// guarding anything sensitive; it's just "don't store plaintext" for free.
export async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Theme = "light" | "dark";

const THEME_COOKIE = "theme";

// The theme preference's source of truth is user_settings in D1 (so it
// follows an account across devices); this cookie is a cheap mirror of it
// so every page can apply the right theme without a D1 query on every
// request -- only /omat's GET and its theme-set POST touch D1 for this,
// everywhere else just reads the cookie. Not HttpOnly: it only ever holds
// "light"/"dark", nothing sensitive, and app.js has no reason to read it
// today but shouldn't be blocked from it later.
export function readThemeCookie(request: Request): Theme | null {
  const match = readCookie(request, THEME_COOKIE);
  return match === "light" || match === "dark" ? match : null;
}

export function themeCookieHeader(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

// The signed-in user's favorite team abbrevs, for highlighting their rows
// in the leaderboard tables (Pistepörssi/Maalivahtipörssi/Rookie-pörssi --
// see _shared/leaderboard.ts's row-team-fav class). Not logged in -> empty
// set, same "no highlight" result as any team that just isn't a favorite.
export async function favoriteTeamAbbrevs(request: Request, env: Env): Promise<Set<string>> {
  const username = currentUsername(request);
  if (!username) return new Set();

  const { results } = await env.DB.prepare("SELECT team_abbrev FROM favorite_teams WHERE username = ?")
    .bind(username)
    .all<{ team_abbrev: string }>();

  return new Set(results.map((r) => r.team_abbrev));
}
