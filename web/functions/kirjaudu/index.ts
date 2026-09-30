// Login/register, replacing Cloudflare Access 2026-10-01. One form, no
// separate signup step: an unknown username creates the account right
// there (password optional -- if left blank, no password is ever required
// for that username again either). See _shared/auth.ts for the cookie/
// hashing details.

import { hashPassword, sessionCookieHeader } from "../_shared/auth";
import { escapeHtml } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import type { Env, UserRow } from "../_shared/types";

function safeNext(value: string | null): string {
  // Only ever redirect back within this site -- a `next` value is
  // attacker-controllable (it's a query/form param), so anything other
  // than a same-site path is ignored in favor of the default.
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/omat";
}

function renderForm(next: string, error: string | null): string {
  return `
<header class="page-header"><h1>🔑 Kirjaudu sisään</h1></header>
<p class="standings-legend">
  Valitse käyttäjänimi. Jos se on uusi, tunnus luodaan automaattisesti. Salasana on valinnainen --
  jos et aseta sitä, käyttäjänimi yksin riittää jatkossakin.
</p>
${error ? `<p class="empty-note">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/kirjaudu" class="login-form">
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <input type="text" name="username" placeholder="Käyttäjänimi" autocomplete="username" required>
  <input type="password" name="password" placeholder="Salasana (valinnainen)" autocomplete="current-password">
  <button type="submit" class="filter-btn active">Kirjaudu sisään</button>
</form>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const next = safeNext(url.searchParams.get("next"));

  const html = await renderLayout({
    title: "Kirjaudu sisään · Morning Hockey",
    headerTitle: "Kirjaudu sisään",
    activePage: "login",
    request: context.request,
    env: context.env,
    content: renderForm(next, null),
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const form = await context.request.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));

  if (!username) {
    const html = await renderLayout({
      title: "Kirjaudu sisään · Morning Hockey",
      headerTitle: "Kirjaudu sisään",
      activePage: "login",
      request: context.request,
      env: context.env,
      content: renderForm(next, "Käyttäjänimi puuttuu."),
    });
    return new Response(html, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const existing = await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<UserRow>();

  if (!existing) {
    const passwordHash = password ? await hashPassword(password) : null;
    await db
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .bind(username, passwordHash, new Date().toISOString())
      .run();
  } else if (existing.password_hash) {
    const providedHash = password ? await hashPassword(password) : null;
    if (providedHash !== existing.password_hash) {
      const html = await renderLayout({
        title: "Kirjaudu sisään · Morning Hockey",
        headerTitle: "Kirjaudu sisään",
        activePage: "login",
        request: context.request,
        env: context.env,
        content: renderForm(next, "Väärä salasana."),
      });
      return new Response(html, { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
    }
  }

  return new Response(null, {
    status: 303,
    headers: { Location: next, "Set-Cookie": sessionCookieHeader(username) },
  });
};
