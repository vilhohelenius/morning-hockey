// Step 1 of Google OAuth (authorization code + PKCE + state). The secrets
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are Pages secrets, never committed.

import { oauthCookieHeader, randomHex, sha256Hex } from "../_shared/auth";
import type { Env } from "../_shared/types";
import { safeNext } from "./index";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GOOGLE_CLIENT_ID) return new Response("Google-kirjautuminen ei ole käytössä.", { status: 503 });

  const url = new URL(request.url);
  const state = randomHex(16);
  const verifier = randomHex(32);
  const challenge = btoa(String.fromCharCode(...(await sha256Bytes(verifier))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/kirjaudu/google/callback`,
    response_type: "code",
    scope: "openid",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const next = safeNext(url.searchParams.get("next"));
  return new Response(null, {
    status: 303,
    headers: {
      Location: auth.toString(),
      "Set-Cookie": oauthCookieHeader(`${state}.${verifier}.${encodeURIComponent(next)}`),
    },
  });
};

async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
