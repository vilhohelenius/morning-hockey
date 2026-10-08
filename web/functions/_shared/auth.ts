// Login: Google OAuth (functions/kirjaudu/google*) + server-side sessions in
// D1. The cookie holds a random token; D1 holds only its SHA-256 and the
// username it belongs to. _middleware.ts resolves the session once per
// request, so currentUsername() stays synchronous for every route.

import type { Env } from "./types";

const SESSION_COOKIE = "mh_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)(?:;|$)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// _middleware.ts (root, so it wraps every route) strips any client-sent
// x-mh-* headers and re-adds them from the verified session, because Pages
// hands routes a different Request object than the middleware saw.
// Pending = signed in with Google but no username chosen yet.
export function currentSession(request: Request): { username: string | null; googleSub: string } | null {
  const sub = request.headers.get("x-mh-sub");
  if (!sub) return null;
  const user = request.headers.get("x-mh-user");
  return { username: user ? decodeURIComponent(user) : null, googleSub: sub };
}

export function currentUsername(request: Request): string | null {
  return currentSession(request)?.username ?? null;
}

export function randomHex(bytes = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Called by _middleware.ts: returns the request to hand to the route.
export async function withSession(request: Request, env: Env): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.delete("x-mh-sub");
  headers.delete("x-mh-user");
  const token = readCookie(request, SESSION_COOKIE);
  const row = token
    ? await env.DB.prepare("SELECT username, google_sub FROM sessions WHERE id_hash = ? AND expires_at > ?")
        .bind(await sha256Hex(token), new Date().toISOString())
        .first<{ username: string | null; google_sub: string }>()
    : null;
  if (row) {
    headers.set("x-mh-sub", row.google_sub);
    if (row.username) headers.set("x-mh-user", encodeURIComponent(row.username));
  }
  return new Request(request, { headers });
}

export async function createSession(env: Env, googleSub: string, username: string | null): Promise<string> {
  const token = randomHex();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(new Date(now).toISOString()),
    env.DB.prepare("INSERT INTO sessions (id_hash, username, google_sub, expires_at) VALUES (?, ?, ?, ?)").bind(
      await sha256Hex(token),
      username,
      googleSub,
      new Date(now + SESSION_MAX_AGE * 1000).toISOString(),
    ),
  ]);
  return token;
}

export async function deleteSession(request: Request, env: Env): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(token)).run();
}

export async function setSessionUsername(request: Request, env: Env, username: string): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("UPDATE sessions SET username = ? WHERE id_hash = ?").bind(username, await sha256Hex(token)).run();
}

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax; HttpOnly; Secure`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure`;
}

// Short-lived OAuth state: "state.verifier.next", HttpOnly, sent back on
// Google's top-level redirect (SameSite=Lax allows that).
export const OAUTH_COOKIE = "mh_oauth";

export function readOauthCookie(request: Request): { state: string; verifier: string; next: string } | null {
  const [state, verifier, ...rest] = (readCookie(request, OAUTH_COOKIE) ?? "").split(".");
  return state && verifier ? { state, verifier, next: decodeURIComponent(rest.join(".")) } : null;
}

export function oauthCookieHeader(value: string, maxAge = 600): string {
  return `${OAUTH_COOKIE}=${value}; Path=/kirjaudu; Max-Age=${maxAge}; SameSite=Lax; HttpOnly; Secure`;
}

// Cache-version cookie bumped by functions/_middleware.ts on every POST.
export function readVersionCookie(request: Request): string {
  return readCookie(request, "mh_v") ?? "";
}

// Same-site redirect target from a form's optional redirect_to field.
export function redirectTarget(form: FormData, fallback: string): string {
  const value = String(form.get("redirect_to") ?? "");
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

// Legacy SHA-256 hash: only used to verify the password of a pre-Google
// account during its one-time claim (/kirjaudu/valitse).
export const hashPassword = sha256Hex;

// "system" isn't a real cookie/CSS value -- it means "no explicit choice",
// which is already what an absent cookie means to style.css's
// prefers-color-scheme fallback. Choosing it just clears the cookie.
export type Theme = "light" | "dark" | "system";

const THEME_COOKIE = "theme";

// The theme preference's source of truth is user_settings in D1 (so it
// follows an account across devices); this cookie is a cheap mirror of it
// so every page can apply the right theme without a D1 query on every
// request -- only /omat's GET and its theme-set POST touch D1 for this,
// everywhere else just reads the cookie. Not HttpOnly: it only ever holds
// "light"/"dark", nothing sensitive, and app.js has no reason to read it
// today but shouldn't be blocked from it later.
export function readThemeCookie(request: Request): "light" | "dark" | null {
  const match = readCookie(request, THEME_COOKIE);
  return match === "light" || match === "dark" ? match : null;
}

export function themeCookieHeader(theme: Theme): string {
  if (theme === "system") return `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

// Tulospiilo ("spoiler-free") mode, same cookie-mirrors-D1 pattern as
// theme above: index.ts's / route reads this on every request to decide
// whether to redirect straight to /tulospiilo, without a D1 query.
const TULOSPIILO_COOKIE = "tulospiilo";

export function readTulospiiloCookie(request: Request): boolean {
  return readCookie(request, TULOSPIILO_COOKIE) === "1";
}

export function tulospiiloCookieHeader(enabled: boolean): string {
  return `${TULOSPIILO_COOKIE}=${enabled ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

// Set client-side (document.cookie) by /tulospiilo's own inline script,
// once every game in a round has been checked off -- lets that round "turn
// itself off" for index.ts's redirect without touching the user's saved
// tulospiilo_mode preference above, so the next round still opens there.
const TULOSPIILO_BYPASS_COOKIE = "tulospiilo_bypass_date";

export function readTulospiiloBypassDate(request: Request): string | null {
  return readCookie(request, TULOSPIILO_BYPASS_COOKIE);
}

// Pörssi row highlight dots (Finnish player / favorite team, see
// _shared/leaderboard.ts's highlightDots). Default ON, so only an explicit
// "0" turns them off. Same cookie-mirrors-D1 pattern as theme/tulospiilo
// (user_settings.highlights is the source of truth).
const HIGHLIGHTS_COOKIE = "highlights";

export function readHighlightsCookie(request: Request): boolean {
  return readCookie(request, HIGHLIGHTS_COOKIE) !== "0";
}

export function highlightsCookieHeader(enabled: boolean): string {
  return `${HIGHLIGHTS_COOKIE}=${enabled ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

// The signed-in user's favorite team abbrevs, for highlighting their rows
// in the leaderboard tables (Pistepörssi/Maalivahtipörssi/Rookie-pörssi --
// see _shared/leaderboard.ts's highlightDots). Not logged in -> empty
// set, same "no highlight" result as any team that just isn't a favorite.
export async function favoriteTeamAbbrevs(request: Request, env: Env): Promise<Set<string>> {
  const username = currentUsername(request);
  if (!username) return new Set();

  const { results } = await env.DB.prepare("SELECT team_abbrev FROM favorite_teams WHERE username = ?")
    .bind(username)
    .all<{ team_abbrev: string }>();

  return new Set(results.map((r) => r.team_abbrev));
}
