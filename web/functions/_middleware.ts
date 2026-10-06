// Cache invalidation for the home page's private HTTP cache (see index.ts).
// The home page is cached by the browser with `Vary: Cookie`, so any change
// to a cookie (login/logout, theme, tulospiilo, highlights) already misses
// the cache. Favorites live only in D1 and change no cookie, so every
// non-GET request (all settings/favorites mutations are POSTs) bumps this
// non-HttpOnly version cookie too; app.js also compares it to detect stale
// bfcache / back-forward restores.
import type { Env } from "./_shared/types";

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next();
  const method = context.request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return response;

  const out = new Response(response.body, response);
  out.headers.append("Set-Cookie", `mh_v=${Date.now().toString(36)}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return out;
};
