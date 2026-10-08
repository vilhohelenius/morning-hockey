// Stanley Cup -voitot (kauden päättymisvuosi, uusin ensin) nykyisen joukkueen
// lyhenteen mukaan, ja pelaajan palkintohuone (herokortin kolmas sivu).
//
// STANLEY_CUPS on generoitu records.nhl.com:n franchise-season-results-
// rajapinnasta (gameTypeId=3, decision=W, seriesAbbrev=SCF) ja tuhoutuneet
// franchiset (Maroons, alkuperäiset Senators) on jätetty pois. Päivitä kerran
// vuodessa kun uusi mestari on selvillä.
export const STANLEY_CUPS: Record<string, number[]> = {
  MTL: [1993, 1986, 1979, 1978, 1977, 1976, 1973, 1971, 1969, 1968, 1966, 1965, 1960, 1959, 1958, 1957, 1956, 1953, 1946, 1944, 1931, 1930, 1924, 1916],
  TOR: [1967, 1964, 1963, 1962, 1951, 1949, 1948, 1947, 1945, 1942, 1932, 1922, 1918],
  DET: [2008, 2002, 1998, 1997, 1955, 1954, 1952, 1950, 1943, 1937, 1936],
  BOS: [2011, 1972, 1970, 1941, 1939, 1929],
  CHI: [2015, 2013, 2010, 1961, 1938, 1934],
  EDM: [1990, 1988, 1987, 1985, 1984],
  PIT: [2017, 2016, 2009, 1992, 1991],
  NYR: [1994, 1940, 1933, 1928],
  NYI: [1983, 1982, 1981, 1980],
  NJD: [2003, 2000, 1995],
  COL: [2022, 2001, 1996],
  TBL: [2021, 2020, 2004],
  PHI: [1975, 1974],
  CAR: [2026, 2006],
  LAK: [2014, 2012],
  FLA: [2025, 2024],
  CGY: [1989],
  DAL: [1999],
  ANA: [2007],
  WSH: [2018],
  STL: [2019],
  VGK: [2023],
};

// NHL:n trophy-nimi (landing.awards[].trophy.default) -> /static/trophies/-kuva
// ja lyhyt näyttönimi. Kuvat ovat records.nhl.com:n JPG:itä mustalla taustalla;
// style.css:n mix-blend-mode: screen poistaa mustan. Tuntemattomat palkinnot
// (esim. All-Star-valinnat) jätetään pois.
const TROPHIES: Record<string, { file: string; label: string }> = {
  "Art Ross Trophy": { file: "art-ross", label: "Art Ross" },
  "Hart Memorial Trophy": { file: "hart-memorial", label: "Hart" },
  "Conn Smythe Trophy": { file: "conn-smythe", label: "Conn Smythe" },
  "Ted Lindsay Award": { file: "ted-lindsay", label: "Ted Lindsay" },
  "Maurice “Rocket” Richard Trophy": { file: "maurice-richard", label: "Richard" },
  "James Norris Memorial Trophy": { file: "james-norris", label: "Norris" },
  "Vezina Trophy": { file: "vezina", label: "Vezina" },
  "Calder Memorial Trophy": { file: "calder-memorial", label: "Calder" },
  "Frank J. Selke Trophy": { file: "frank-j-selke", label: "Selke" },
  "Lady Byng Memorial Trophy": { file: "lady-byng", label: "Lady Byng" },
  "William M. Jennings Trophy": { file: "william-m-jennings", label: "Jennings" },
  "Bill Masterton Memorial Trophy": { file: "bill-masterton", label: "Masterton" },
  "King Clancy Memorial Trophy": { file: "king-clancey", label: "King Clancy" },
  "Mark Messier NHL Leadership Award": { file: "mark-messier", label: "Messier" },
  "NHL Foundation Player Award": { file: "foundation-player", label: "Foundation" },
};

const STANLEY_CUP = "Stanley Cup";

// Muut joukkuepalkinnot (kauden päättymisvuosi, uusin ensin), poimittu Wikipedian
// voittajalistoista ja tarkistettu Stanley Cup -finalistien kanssa. Konferenssipalkinnot
// = konferenssin pudotuspelimestari 1982 alkaen (2021: puolivälierävoittajat). Päivitä
// kerran vuodessa Stanley Cupin yhteydessä.
const PRESIDENTS: Record<string, number[]> = {
  DET: [2008, 2006, 2004, 2002, 1996, 1995],
  NYR: [2024, 2015, 1994, 1992],
  COL: [2026, 2021, 2001, 1997],
  BOS: [2020, 2014, 1990],
  WSH: [2017, 2016, 2010],
  EDM: [1987, 1986],
  CGY: [1989, 1988],
  CHI: [2013, 1991],
  DAL: [1999, 1998],
  VAN: [2012, 2011],
  PIT: [1993],
  STL: [2000],
  OTT: [2003],
  BUF: [2007],
  SJS: [2009],
  NSH: [2018],
  TBL: [2019],
  FLA: [2022],
  WPG: [2025],
};

const PRINCE_OF_WALES: Record<string, number[]> = {
  PIT: [2017, 2016, 2009, 2008, 1992, 1991],
  BOS: [2019, 2013, 2011, 1990, 1988],
  NJD: [2012, 2003, 2001, 2000, 1995],
  TBL: [2022, 2021, 2020, 2015, 2004],
  PHI: [2010, 1997, 1987, 1985],
  FLA: [2025, 2024, 2023, 1996],
  NYI: [1984, 1983, 1982],
  MTL: [1993, 1989, 1986],
  CAR: [2026, 2006, 2002],
  NYR: [2014, 1994],
  WSH: [2018, 1998],
  BUF: [1999],
  OTT: [2007],
};

const CLARENCE_CAMPBELL: Record<string, number[]> = {
  EDM: [2025, 2024, 2006, 1990, 1988, 1987, 1985, 1984, 1983],
  DET: [2009, 2008, 2002, 1998, 1997, 1995],
  DAL: [2020, 2000, 1999, 1991],
  CHI: [2015, 2013, 2010, 1992],
  VAN: [2011, 1994, 1982],
  CGY: [2004, 1989, 1986],
  LAK: [2014, 2012, 1993],
  COL: [2022, 2001, 1996],
  VGK: [2026, 2023, 2018],
  ANA: [2007, 2003],
  SJS: [2016],
  NSH: [2017],
  STL: [2019],
  MTL: [2021],
};

export function renderCupYears(years: number[]): string {
  return `<div class="cup-years">${years.map((y) => `<span>${y}</span>`).join("")}</div>`;
}

const TEAM_TROPHIES = [
  { file: "presidents", label: "Presidents’", wins: PRESIDENTS },
  { file: "prince-of-wales", label: "Prince of Wales", wins: PRINCE_OF_WALES },
  { file: "clarence-s-campbell", label: "Campbell Bowl", wins: CLARENCE_CAMPBELL },
];

// Joukkuesivun heron pokaalipuoli; tyhjä jos joukkue ei ole voittanut mitään.
// Stanley Cupista kaikki vuodet, muista vuodet vain jos voittoja enintään kolme.
export function renderTeamCups(abbrev: string): string {
  const years = STANLEY_CUPS[abbrev];
  const cup = years?.length
    ? `
    <div class="team-cups-head"><img src="/static/trophies/stanley-cup.png" alt="Stanley Cup" width="31" height="46" class="trophy-img"><b>${years.length}</b></div>
    ${renderCupYears(years)}`
    : "";
  const items = TEAM_TROPHIES.filter((t) => t.wins[abbrev]?.length)
    .map(({ file, label, wins }) => {
      const w = wins[abbrev];
      const when = w.length > 3 ? "" : `<small>${[...w].reverse().join(" · ")}</small>`;
      return `<div class="trophy-item"><div class="trophy-pic"><img src="/static/trophies/${file}.png" alt="" width="40" height="60" class="trophy-img" loading="lazy"></div><span class="trophy-count">${w.length}<i>×</i></span><b>${label}</b>${when}</div>`;
    })
    .join("");
  if (!cup && !items) return "";
  return `
  <div class="team-cups">${cup}${items ? `<div class="trophy-shelf team-shelf">${items}</div>` : ""}
  </div>`;
}

type Award = { trophy?: { default?: string }; seasons?: { seasonId: number }[] };

function seasonYears(a: Award): number[] {
  return (a.seasons ?? []).map((s) => Number(String(s.seasonId).slice(4))).sort((x, y) => y - x);
}

// Palkintohuone: tyhjä merkkijono jos pelaajalla ei ole yhtään tunnettua palkintoa.
export function renderTrophyRoom(awards: Award[] | undefined): string {
  const list = awards ?? [];
  const cup = list.find((a) => a.trophy?.default === STANLEY_CUP);
  const items = list
    .map((a) => ({ t: TROPHIES[a.trophy?.default ?? ""], years: seasonYears(a) }))
    .filter((x) => x.t && x.years.length);
  if (!cup && !items.length) return "";

  const cupYears = cup ? seasonYears(cup) : [];
  const cupHtml = cupYears.length
    ? `<div class="trophy-room-cup"><img src="/static/trophies/stanley-cup.png" alt="" width="64" height="96" class="trophy-img"><div><div class="trophy-count">${cupYears.length} <i>× Stanley Cup</i></div>${renderCupYears(cupYears)}</div></div>`
    : "";
  const itemsHtml = items
    .map(({ t, years }) => {
      const when = years.length > 3 ? `${years[years.length - 1]} – ${years[0]}` : [...years].reverse().join(" · ");
      return `<div class="trophy-item"><div class="trophy-pic"><img src="/static/trophies/${t.file}.png" alt="" width="40" height="60" class="trophy-img" loading="lazy"></div><span class="trophy-count">${years.length}<i>×</i></span><b>${t.label}</b><small>${when}</small></div>`;
    })
    .join("");

  return `
  <div class="trophy-room-title"><h2>Palkinnot</h2></div>
  ${cupHtml}
  ${itemsHtml ? `<div class="trophy-shelf">${itemsHtml}</div>` : ""}`;
}
