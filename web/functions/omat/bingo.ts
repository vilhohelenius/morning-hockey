// Pistemiesbingo slip: add/remove a skater. Plain form POST like
// favorites/players.ts. A new pick is bound to the night of the first game
// that hasn't started yet (see _shared/bingo.ts); stale rows (older nights)
// are pruned here on every add.

import { currentUsername, redirectTarget } from "../_shared/auth";
import { expiredThrough, newPickRoundDate } from "../_shared/bingo";
import { MAX_PICKS_PER_ROUND, loadWindowGames } from "../_shared/bingoData";
import type { Env } from "../_shared/types";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) return new Response("Kirjaudu sisään ensin.", { status: 401 });

  const form = await context.request.formData();
  const playerId = Number(form.get("player_id"));
  const action = String(form.get("bingo_action") ?? "");
  const db = context.env.DB;
  if (action === "clear") {
    await db.prepare("DELETE FROM bingo_picks WHERE username = ?").bind(username).run();
    return new Response(null, { status: 303, headers: { Location: redirectTarget(form, "/bingo") } });
  }
  if (!Number.isInteger(playerId)) return new Response("Virheellinen pelaaja.", { status: 400 });

  if (action === "remove") {
    const roundDate = String(form.get("round_date") ?? "");
    await db
      .prepare("DELETE FROM bingo_picks WHERE username = ? AND player_id = ? AND (? = '' OR round_date = ?)")
      .bind(username, playerId, roundDate, roundDate)
      .run();
  } else {
    const skater = await db
      .prepare("SELECT player_id FROM team_roster_skaters WHERE player_id = ?")
      .bind(playerId)
      .first();
    if (!skater) return new Response("Pelaajaa ei löytynyt.", { status: 404 });

    const now = Date.now();
    const games = await loadWindowGames(db);
    const roundDate = newPickRoundDate(games, now);

    await db.prepare("DELETE FROM bingo_picks WHERE username = ? AND round_date <= ?").bind(username, expiredThrough(now)).run();
    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM bingo_picks WHERE username = ? AND round_date = ?")
      .bind(username, roundDate)
      .first<{ n: number }>();
    if ((count?.n ?? 0) < MAX_PICKS_PER_ROUND) {
      await db
        .prepare(
          "INSERT INTO bingo_picks (username, player_id, round_date, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
        )
        .bind(username, playerId, roundDate, new Date(now).toISOString())
        .run();
    }
  }

  return new Response(null, { status: 303, headers: { Location: redirectTarget(form, "/bingo") } });
};
