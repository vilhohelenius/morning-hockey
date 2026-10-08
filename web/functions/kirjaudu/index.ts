// Login page: just the Google button. Accounts and sessions live in
// _shared/auth.ts; the OAuth flow in google.ts + google/callback.ts; first-
// time username pick / old-account claim in valitse.ts.

import { icon, escapeHtml } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import type { Env } from "../_shared/types";

export function safeNext(value: string | null): string {
  // `next` is attacker-controllable -- only ever redirect within this site.
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const next = safeNext(new URL(context.request.url).searchParams.get("next"));
  const html = await renderLayout({
    title: "Kirjaudu sisään · Morning Hockey",
    headerTitle: "Kirjaudu sisään",
    activePage: "login",
    request: context.request,
    env: context.env,
    content: `
<a class="back-link js-back" href="/">← Takaisin</a>
<header class="page-header"><h1>${icon("key")} Kirjaudu sisään</h1></header>
<p class="standings-legend">Kirjaudu Google-tilillä. Sovellus tallentaa vain Googlen tunnisteen, ei sähköpostiosoitettasi. <a href="/tietosuoja">Tietosuoja</a></p>
<p><a class="filter-btn active" href="/kirjaudu/google?next=${escapeHtml(encodeURIComponent(next))}">Kirjaudu Googlella</a></p>`,
  });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
