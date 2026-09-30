// Cloudflare Access identity + the theme cookie, phase 7.
//
// Cf-Access-Authenticated-User-Email is only trustworthy when Cloudflare
// Access is actually configured to protect this deployment: Access
// validates the login at Cloudflare's edge and sets this header itself
// before the request ever reaches the Worker, so a client can't forge it
// *as long as Access is in front of the route*. Without Access configured
// (e.g. local dev, or if the dashboard side of phase 7 isn't set up yet),
// this header is simply absent -- every route here treats that as "not
// logged in", never as an error, since that's exactly what it is for the
// unprotected *.pages.dev preview during rollout.
export function authenticatedEmail(request: Request): string | null {
  return request.headers.get("Cf-Access-Authenticated-User-Email");
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
  const header = request.headers.get("Cookie");
  if (!header) return null;
  const match = header.match(/(?:^|;\s*)theme=(light|dark)(?:;|$)/);
  return match ? (match[1] as Theme) : null;
}

export function themeCookieHeader(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
