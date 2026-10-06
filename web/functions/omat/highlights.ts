// Pörssi highlight dots on/off (default on). Same pattern as tulospiilo.ts:
// D1 (user_settings.highlights) is the source of truth so it follows the
// account across devices, mirrored into a cookie that the pörssi pages read
// (see _shared/auth.ts's readHighlightsCookie) without a D1 round-trip.

import { currentUsername, highlightsCookieHeader, readThemeCookie } from "../_shared/auth";
import type { Env } from "../_shared/types";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) return new Response("Kirjaudu sisään ensin.", { status: 401 });

  const form = await context.request.formData();
  const enabled = String(form.get("enabled") ?? "") === "1";

  // theme is NOT NULL with no DB default; see tulospiilo.ts for why the
  // theme cookie is the fallback on a user's first saved setting.
  await context.env.DB
    .prepare(
      `INSERT INTO user_settings (username, theme, highlights, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET highlights = excluded.highlights, updated_at = excluded.updated_at`,
    )
    .bind(username, readThemeCookie(context.request) ?? "light", enabled ? 1 : 0, new Date().toISOString())
    .run();

  return new Response(null, {
    status: 303,
    headers: { Location: "/omat", "Set-Cookie": highlightsCookieHeader(enabled) },
  });
};
