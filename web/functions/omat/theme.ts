// Theme toggle. Writes the preference to D1 (source of truth, follows an
// account across devices) and mirrors it into the theme cookie every other
// route reads (see _shared/auth.ts) so it applies immediately without
// every page needing its own D1 query.

import { currentUsername, themeCookieHeader, type Theme } from "../_shared/auth";
import type { Env } from "../_shared/types";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) return new Response("Kirjaudu sisään ensin.", { status: 401 });

  const form = await context.request.formData();
  const theme = String(form.get("theme") ?? "");
  if (theme !== "light" && theme !== "dark") {
    return new Response("Virheellinen teema.", { status: 400 });
  }

  const db = context.env.DB;
  await db
    .prepare(
      `INSERT INTO user_settings (username, theme, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET theme = excluded.theme, updated_at = excluded.updated_at`,
    )
    .bind(username, theme, new Date().toISOString())
    .run();

  return new Response(null, {
    status: 303,
    headers: { Location: "/omat", "Set-Cookie": themeCookieHeader(theme as Theme) },
  });
};
