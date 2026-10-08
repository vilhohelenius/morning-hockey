// Step 2: Google redirects here with ?code&state. We verify state against the
// HttpOnly mh_oauth cookie, swap the code for an id_token server-side (client
// secret + PKCE verifier), and read `sub`. The id_token comes straight from
// Google's token endpoint over TLS, so per Google's docs its signature need
// not be re-verified; we still check iss/aud.

import { OAUTH_COOKIE, createSession, oauthCookieHeader, readOauthCookie, sessionCookieHeader } from "../../_shared/auth";
import type { Env } from "../../_shared/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const saved = readOauthCookie(request);
  const code = url.searchParams.get("code");
  if (!saved || !code || saved.state !== url.searchParams.get("state") || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return new Response(null, { status: 303, headers: { Location: "/kirjaudu" } });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/kirjaudu/google/callback`,
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  const idToken = tokenRes.ok ? ((await tokenRes.json()) as { id_token?: string }).id_token : undefined;
  if (!idToken) return new Response("Google-kirjautuminen epäonnistui.", { status: 502 });

  const b64 = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))) as {
    iss: string;
    aud: string;
    sub: string;
  };
  if (claims.aud !== env.GOOGLE_CLIENT_ID || !["https://accounts.google.com", "accounts.google.com"].includes(claims.iss)) {
    return new Response("Google-kirjautuminen epäonnistui.", { status: 502 });
  }

  const user = await env.DB.prepare("SELECT username FROM users WHERE google_sub = ?").bind(claims.sub).first<{ username: string }>();
  const token = await createSession(env, claims.sub, user?.username ?? null);

  const headers = new Headers({
    Location: user ? saved.next || "/omat" : `/kirjaudu/valitse?next=${encodeURIComponent(saved.next || "/omat")}`,
  });
  headers.append("Set-Cookie", sessionCookieHeader(token));
  headers.append("Set-Cookie", oauthCookieHeader("", 0));
  return new Response(null, { status: 303, headers });
};
