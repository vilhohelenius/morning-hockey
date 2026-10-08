// Favorite-player toggle. Same plain-form-POST shape (and redirect_to
// handling) as favorites/teams.ts.

import { currentUsername } from "../../_shared/auth";
import { FAVORITE_LIMIT_MESSAGE, MAX_FAVORITE_PLAYERS } from "../../_shared/favorites";
import type { Env } from "../../_shared/types";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) return new Response("Kirjaudu sisään ensin.", { status: 401 });

  const form = await context.request.formData();
  const playerId = Number(form.get("player_id"));
  const isGoalie = form.get("is_goalie") === "1" ? 1 : 0;
  const action = String(form.get("fav_action") ?? "");
  if (!Number.isInteger(playerId)) return new Response("Virheellinen pelaaja.", { status: 400 });

  const db = context.env.DB;
  if (action === "remove") {
    await db.prepare("DELETE FROM favorite_players WHERE username = ? AND player_id = ?").bind(username, playerId).run();
  } else {
    // Count check and insert in one statement so parallel adds can't pass the limit.
    const result = await db
      .prepare(
        `INSERT INTO favorite_players (username, player_id, is_goalie, created_at)
         SELECT ?1, ?2, ?3, ?4 WHERE (SELECT COUNT(*) FROM favorite_players WHERE username = ?1) < ?5
         ON CONFLICT(username, player_id) DO NOTHING`,
      )
      .bind(username, playerId, isGoalie, new Date().toISOString(), MAX_FAVORITE_PLAYERS)
      .run();
    if (!result.meta.changes) {
      const existing = await db.prepare("SELECT 1 FROM favorite_players WHERE username = ? AND player_id = ?").bind(username, playerId).first();
      if (!existing) {
        // fetch() callers (hero star) get a 409 to show a toast; plain form posts land back on the page with ?raja=1.
        if (context.request.headers.get("X-Fav-Toggle")) return new Response(FAVORITE_LIMIT_MESSAGE, { status: 409 });
        const back = String(form.get("redirect_to") ?? "");
        const safe = back.startsWith("/") && !back.startsWith("//") ? back : "/omat";
        return new Response(null, { status: 303, headers: { Location: `${safe}${safe.includes("?") ? "&" : "?"}raja=1` } });
      }
    }
  }

  const redirectTo = String(form.get("redirect_to") ?? "");
  const location = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/omat";
  return new Response(null, { status: 303, headers: { Location: location } });
};
