// Tulospiilo ("spoiler-free") mode toggle. Same pattern as theme.ts: D1
// (user_settings) is the source of truth, mirrored into a cookie every
// request to / reads (see _shared/auth.ts) so the redirect decision never
// needs a D1 round-trip.

import { currentUsername, readThemeCookie, tulospiiloCookieHeader } from "../_shared/auth";
import type { Env } from "../_shared/types";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) return new Response("Kirjaudu sisään ensin.", { status: 401 });

  const form = await context.request.formData();
  const enabled = String(form.get("enabled") ?? "") === "1";

  // theme is NOT NULL with no DB default -- only relevant the first time any
  // setting is saved for this user (theme.ts's own INSERT always supplies a
  // real value already), so this falls back to whatever the browser's
  // current theme cookie says rather than inventing an arbitrary one.
  const db = context.env.DB;
  await db
    .prepare(
      `INSERT INTO user_settings (username, theme, tulospiilo_mode, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET tulospiilo_mode = excluded.tulospiilo_mode, updated_at = excluded.updated_at`,
    )
    .bind(username, readThemeCookie(context.request) ?? "light", enabled ? 1 : 0, new Date().toISOString())
    .run();

  return new Response(null, {
    status: 303,
    headers: { Location: "/omat", "Set-Cookie": tulospiiloCookieHeader(enabled) },
  });
};
