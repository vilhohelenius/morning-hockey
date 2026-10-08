// Resolves a finished game's real NHL Highlights video on YouTube, instead
// of the plain search-results link _shared/gameCard.ts's youtubeHighlightsUrl
// falls back to. Needs YOUTUBE_API_KEY (YouTube Data API v3, enabled in
// Google Cloud, stored as a Cloudflare Pages secret) -- without it, this
// returns the fallback immediately, no API call either way.
//
// NHL's own uploads are always titled "{Away} vs. {Home} | NHL Highlights |
// {Month D, YYYY}" (_shared/gameCard.ts's highlightsSearchTitle). Rather
// than trust a hardcoded channel ID (not verifiable from this sandbox, and
// channel IDs occasionally change on reorganization), this searches by
// that exact title text and accepts only a result whose channelTitle is
// literally "NHL" -- cheap to check since search.list already returns
// channelTitle on every hit, no second API call needed to resolve a
// channel ID first.
//
// Caching: a *found* video is cached forever (game_id -> video_url, D1
// table youtube_highlights). A *not found yet* result is also cached, but
// only honored for RETRY_AFTER_MS -- highlights can take hours to appear
// after a game ends, and this is called on every page view of a finished
// game, so without this a popular game would burn a 100-unit search quota
// call (out of YouTube's default 10,000 units/day) on every single visit
// until the video shows up.

import { highlightsSearchTitle, youtubeHighlightsUrl } from "./gameCard";
import type { Env, GameRow, YoutubeHighlightRow } from "./types";

const RETRY_AFTER_MS = 60 * 60 * 1000; // 1 hour

interface YoutubeSearchItem {
  id?: { videoId?: string };
  snippet?: { channelTitle?: string };
}

async function searchNhlVideo(title: string, apiKey: string): Promise<string | null> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance&maxResults=5&q=${encodeURIComponent(title)}&key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`YouTube search failed (${response.status}) for "${title}"`);
    return null;
  }
  const data = (await response.json()) as { items?: YoutubeSearchItem[] };
  const hit = (data.items ?? []).find((item) => item.snippet?.channelTitle === "NHL" && item.id?.videoId);
  return hit?.id?.videoId ?? null;
}

// Never throws: this is a "nice to have" link, not core page content, and
// every call site renders the result directly into a page that would
// otherwise render fine without it -- a D1/network/API hiccup here (e.g.
// the youtube_highlights table not existing yet, or a bad API key) must
// degrade to the plain search-link fallback, not crash the whole page.
// `preloaded` (from loadYoutubeRows) replaces the per-game cache lookup.
export async function resolveHighlightsUrl(
  db: D1Database,
  env: Env,
  game: GameRow,
  preloaded?: Map<number, YoutubeHighlightRow>,
): Promise<string> {
  const fallback = youtubeHighlightsUrl(game);
  if (!env.YOUTUBE_API_KEY) return fallback;

  try {
    const cached = preloaded
      ? (preloaded.get(game.game_id) ?? null)
      : await db.prepare("SELECT * FROM youtube_highlights WHERE game_id = ?").bind(game.game_id).first<YoutubeHighlightRow>();

    if (cached?.video_url) return cached.video_url;
    if (cached && Date.now() - new Date(cached.checked_at).getTime() < RETRY_AFTER_MS) return fallback;

    const videoId = await searchNhlVideo(highlightsSearchTitle(game), env.YOUTUBE_API_KEY);
    const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;

    await db
      .prepare(
        `INSERT INTO youtube_highlights (game_id, video_url, checked_at) VALUES (?, ?, ?)
         ON CONFLICT(game_id) DO UPDATE SET video_url = excluded.video_url, checked_at = excluded.checked_at`,
      )
      .bind(game.game_id, videoUrl, new Date().toISOString())
      .run();

    return videoUrl ?? fallback;
  } catch (error) {
    console.error(`resolveHighlightsUrl failed for game ${game.game_id}:`, error);
    return fallback;
  }
}

// One query for many games. undefined on failure so callers fall back to the
// per-game lookup (which degrades to the plain search link) instead of
// treating every game as "never searched" and spending YouTube quota.
export async function loadYoutubeRows(db: D1Database, gameIds: number[]): Promise<Map<number, YoutubeHighlightRow> | undefined> {
  if (!gameIds.length) return new Map();
  try {
    const { results } = await db
      .prepare(`SELECT * FROM youtube_highlights WHERE game_id IN (${gameIds.map(() => "?").join(",")})`)
      .bind(...gameIds)
      .all<YoutubeHighlightRow>();
    return new Map(results.map((r) => [r.game_id, r]));
  } catch (error) {
    console.error("youtube_highlights bulk lookup failed:", error);
    return undefined;
  }
}
