// Pörssi highlight dots on/off (default on). Cookie-only, see
// _shared/auth.ts's readHighlightsCookie.

import { currentUsername, highlightsCookieHeader } from "../_shared/auth";
import type { Env } from "../_shared/types";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) return new Response("Kirjaudu sisään ensin.", { status: 401 });

  const form = await context.request.formData();
  const enabled = String(form.get("enabled") ?? "") === "1";

  return new Response(null, {
    status: 303,
    headers: { Location: "/omat", "Set-Cookie": highlightsCookieHeader(enabled) },
  });
};
