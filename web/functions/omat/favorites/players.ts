// Favorite-player toggle. Same plain-form-POST shape as favorites/teams.ts.

import { currentUsername } from "../../_shared/auth";
import type { Env } from "../../_shared/types";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) return new Response("Kirjaudu sisään ensin.", { status: 401 });

  const form = await context.request.formData();
  const playerId = Number(form.get("player_id"));
  const isGoalie = form.get("is_goalie") === "1" ? 1 : 0;
  const action = String(form.get("action") ?? "");
  if (!Number.isInteger(playerId)) return new Response("Virheellinen pelaaja.", { status: 400 });

  const db = context.env.DB;
  if (action === "remove") {
    await db.prepare("DELETE FROM favorite_players WHERE username = ? AND player_id = ?").bind(username, playerId).run();
  } else {
    await db
      .prepare(
        "INSERT INTO favorite_players (username, player_id, is_goalie, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(username, player_id) DO NOTHING",
      )
      .bind(username, playerId, isGoalie, new Date().toISOString())
      .run();
  }

  return new Response(null, { status: 303, headers: { Location: "/omat" } });
};
