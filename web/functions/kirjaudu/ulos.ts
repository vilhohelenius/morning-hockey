// Logout: clear the session cookie, redirect home. GET (not POST) on
// purpose -- it's a plain link/button with no state to protect, same
// reasoning as everywhere else auth.ts's cookie isn't treated as a real
// security boundary. A POST form works too (Asetukset uses one for a
// same-look button), this just also works as a bare link.

import { clearSessionCookieHeader } from "../_shared/auth";
import type { Env } from "../_shared/types";

const handler: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Set-Cookie": clearSessionCookieHeader() },
  });
};

export const onRequestGet = handler;
export const onRequestPost = handler;
