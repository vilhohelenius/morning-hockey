// Pre-game home win probability (game_win_prob, written by the Python sync's
// winprob step). Shown only in the preview of an unplayed game.
import type { TeamStatRow } from "./types";

export interface GameWinProb {
  home_win_prob: number;
  ability: number;
  chances: number;
  goalie: number;
  context: number;
}

// Missing table or row (model not synced yet) -> null, and the block is hidden.
export async function fetchGameWinProb(db: D1Database, gameId: number): Promise<GameWinProb | null> {
  try {
    return await db
      .prepare("SELECT home_win_prob, ability, chances, goalie, context FROM game_win_prob WHERE game_id = ?")
      .bind(gameId)
      .first<GameWinProb>();
  } catch (error) {
    console.error(`Win probability lookup failed for ${gameId}:`, error);
    return null;
  }
}

// Integer percents that always sum to 100 and never show 0 or 100.
export function winProbPercents(homeWinProb: number): { home: number; away: number } {
  const home = Math.min(99, Math.max(1, Math.round(homeWinProb * 100)));
  return { home, away: 100 - home };
}

const FACTOR_FI: Record<"ability" | "chances" | "goalie" | "context", string> = {
  ability: "tulokset",
  chances: "maalipaikat",
  goalie: "maalivahdit",
  context: "pelirasitus",
};

// The component that moves the prediction most (|logit contribution|), null if all are negligible.
export function biggestFactor(p: GameWinProb): string | null {
  const keys = Object.keys(FACTOR_FI) as (keyof typeof FACTOR_FI)[];
  const top = keys.reduce((a, b) => (Math.abs(p[b]) > Math.abs(p[a]) ? b : a));
  return Math.abs(p[top]) >= 0.05 ? FACTOR_FI[top] : null;
}

export function winProbStatRow(p: GameWinProb): TeamStatRow {
  const { home, away } = winProbPercents(p.home_win_prob);
  return { label: "Voittotodennäköisyys", away_value: `${away} %`, home_value: `${home} %`, away_pct: away, home_pct: home };
}

export function winProbInfoText(p: GameWinProb): string {
  const factor = biggestFactor(p);
  return `
<details class="xg-info">
  <summary>Miten ennuste lasketaan?</summary>
  <p>Ennuste perustuu joukkueiden viimeaikaiseen menestykseen (tulokset, maalipaikat, laukaukset ja xG), kotiedun ja
  pelirasituksen sekä maalivahtien tasoon. Uusimmat ottelut painavat eniten. Jääkiekossa suosikkikin häviää usein:
  malli osuu oikeaan noin 60 % otteluista, joten prosentti kertoo tendenssin, ei varmuutta.</p>
  <p>Maalivahdit arvioidaan joukkueen viimeisimpien aloittajien perusteella, ei vahvistetun aloittajan, joten ennuste ei
  muutu aloittajan varmistuessa. Kauden alussa ennusteet ovat epävarmempia, koska ne nojaavat vielä edelliseen kauteen.${
    factor ? ` Tämän ottelun ennusteessa suurin tekijä: ${factor}.` : ""
  }</p>
</details>`;
}
