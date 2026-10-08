// Bug report from Asetukset: stored in D1 (bug_reports), read by the owner
// in the D1 Console. Plain form POST like the other /omat routes.

import { currentUsername, redirectTarget } from "../_shared/auth";
import type { Env } from "../_shared/types";

const MAX_LENGTH = 2000;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) return new Response("Kirjaudu sisään ensin.", { status: 401 });

  const form = await context.request.formData();
  const message = String(form.get("message") ?? "").trim().slice(0, MAX_LENGTH);
  if (!message) return new Response("Kirjoita ensin kuvaus virheestä.", { status: 400 });

  await context.env.DB
    .prepare("INSERT INTO bug_reports (username, message, user_agent, created_at) VALUES (?, ?, ?, ?)")
    .bind(username, message, (context.request.headers.get("user-agent") ?? "").slice(0, 300), new Date().toISOString())
    .run();

  return new Response(null, { status: 303, headers: { Location: redirectTarget(form, "/omat") } });
};
