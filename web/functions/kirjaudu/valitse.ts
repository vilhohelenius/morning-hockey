// First Google login for a sub we haven't seen: pick a new username.

import { currentSession, setSessionUsername } from "../_shared/auth";
import { icon, escapeHtml } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import type { Env } from "../_shared/types";
import { safeNext } from "./index";

async function page(context: EventContext<Env, any, any>, next: string, error: string | null, status = 200) {
  const html = await renderLayout({
    title: "Valitse käyttäjänimi · Morning Hockey",
    headerTitle: "Käyttäjänimi",
    activePage: "login",
    request: context.request,
    env: context.env,
    content: `
<header class="page-header"><h1>${icon("key")} Valitse käyttäjänimi</h1></header>
<p class="standings-legend">
  Valitse käyttäjänimi.
</p>
${error ? `<p class="empty-note">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/kirjaudu/valitse" class="login-form">
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <input type="text" name="username" placeholder="Käyttäjänimi" maxlength="30" autocomplete="off" required>
  <button type="submit" class="filter-btn active">Jatka</button>
</form>`,
  });
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

const pending = (c: EventContext<Env, any, any>) => {
  const s = currentSession(c.request);
  return s && !s.username ? s : null;
};
const home = () => new Response(null, { status: 303, headers: { Location: "/kirjaudu" } });

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!pending(context)) return home();
  return page(context, safeNext(new URL(context.request.url).searchParams.get("next")), null);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const session = pending(context);
  if (!session) return home();

  const form = await context.request.formData();
  const username = String(form.get("username") ?? "").trim();
  const next = safeNext(String(form.get("next") ?? ""));
  if (username.length < 2 || username.length > 30) return page(context, next, "Käyttäjänimen pituus 2–30 merkkiä.", 400);

  const db = context.env.DB;
  const ok = !!(await db
    .prepare("INSERT OR IGNORE INTO users (username, password_hash, google_sub, created_at) VALUES (?, NULL, ?, ?)")
    .bind(username, session.googleSub, new Date().toISOString())
    .run()).meta.changes;
  if (!ok) return page(context, next, "Käyttäjänimi on varattu.", 409);

  await setSessionUsername(context.request, context.env, username);
  return new Response(null, { status: 303, headers: { Location: next } });
};
