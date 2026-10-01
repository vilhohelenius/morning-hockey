// Favorite-team toggle. Plain form POST, progressively enhanced by app.js
// (see data-fav-toggle) into a no-navigation toggle for the hero-banner
// star on team pages; without JS (or for /omat's own favorites list, which
// doesn't send redirect_to) it redirects back to wherever the form says,
// defaulting to /omat.

import { currentUsername } from "../../_shared/auth";
import type { Env } from "../../_shared/types";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) return new Response("Kirjaudu sisään ensin.", { status: 401 });

  const form = await context.request.formData();
  const abbrev = String(form.get("abbrev") ?? "").toUpperCase();
  const action = String(form.get("action") ?? "");
  if (!abbrev) return new Response("Puuttuva joukkue.", { status: 400 });

  const db = context.env.DB;
  if (action === "remove") {
    await db.prepare("DELETE FROM favorite_teams WHERE username = ? AND team_abbrev = ?").bind(username, abbrev).run();
  } else {
    await db
      .prepare(
        "INSERT INTO favorite_teams (username, team_abbrev, created_at) VALUES (?, ?, ?) ON CONFLICT(username, team_abbrev) DO NOTHING",
      )
      .bind(username, abbrev, new Date().toISOString())
      .run();
  }

  const redirectTo = String(form.get("redirect_to") ?? "");
  const location = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/omat";
  return new Response(null, { status: 303, headers: { Location: location } });
};
