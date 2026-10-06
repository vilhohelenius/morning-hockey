// Per-team accent colors for the favorite-team highlight dot (see
// leaderboard.ts's highlight dots). Not a canonical team list used
// anywhere else -- nothing in this codebase hardcodes the 32 teams; every
// route derives them dynamically from D1 (synced from the NHL API). These
// are just a visual hint, so an unmapped or renamed abbrev falls back to
// var(--accent) at the call site rather than this file ever needing to be
// "the" source of truth for which teams exist.
export const TEAM_COLORS: Record<string, string> = {
  ANA: "#F47A38",
  BOS: "#FFB81C",
  BUF: "#002654",
  CAR: "#CC0000",
  CBJ: "#002654",
  CGY: "#D2001C",
  CHI: "#CF0A2C",
  COL: "#6F263D",
  DAL: "#006847",
  DET: "#CE1126",
  EDM: "#FF4C00",
  FLA: "#C8102E",
  LAK: "#A2AAAD",
  MIN: "#154734",
  MTL: "#AF1E2D",
  NJD: "#CE1126",
  NSH: "#FFB81C",
  NYI: "#00539B",
  NYR: "#0038A8",
  OTT: "#C52032",
  PHI: "#F74902",
  PIT: "#FCB514",
  SEA: "#99D9D9",
  SJS: "#006D75",
  STL: "#002F87",
  TBL: "#002868",
  TOR: "#00205B",
  UTA: "#71AFE5",
  VAN: "#00205B",
  VGK: "#B4975A",
  WPG: "#041E42",
  WSH: "#C8102E",
};
