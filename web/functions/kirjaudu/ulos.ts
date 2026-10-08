// Logout: delete the session row, clear the cookie. POST only, so a
// cross-site link/image can't log anyone out.

import { clearSessionCookieHeader, deleteSession } from "../_shared/auth";
import type { Env } from "../_shared/types";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await deleteSession(request, env);
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": clearSessionCookieHeader() } });
};
