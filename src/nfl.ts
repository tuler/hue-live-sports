/**
 * The 32 NFL teams, keyed by the abbreviation ESPN's scoreboard uses.
 *
 * `colors` are lamp colours, not brand colours: they start from each team's
 * palette, but black is dropped (a lamp cannot show it), silver becomes white,
 * and shades too dark and grey to read on a bulb are swapped for a saturated
 * version of the same hue. Override them per effect with `colors` in the config.
 */
export interface NflTeam {
  abbr: string;
  city: string;
  nickname: string;
  division: `${"AFC" | "NFC"} ${"East" | "North" | "South" | "West"}`;
  /** One or two hex colours, most recognisable first. */
  colors: [string] | [string, string];
  /** Other abbreviations and short names people use. */
  aliases?: string[];
}

const WHITE = "FFFFFF";

export const NFL_TEAMS: readonly NflTeam[] = [
  { abbr: "BUF", city: "Buffalo", nickname: "Bills", division: "AFC East", colors: ["00338D", "C60C30"] },
  { abbr: "MIA", city: "Miami", nickname: "Dolphins", division: "AFC East", colors: ["008E97", "FC4C02"], aliases: ["fins"] },
  { abbr: "NE", city: "New England", nickname: "Patriots", division: "AFC East", colors: ["002244", "C60C30"], aliases: ["NWE", "pats"] },
  { abbr: "NYJ", city: "New York", nickname: "Jets", division: "AFC East", colors: ["00703C", WHITE] },

  { abbr: "BAL", city: "Baltimore", nickname: "Ravens", division: "AFC North", colors: ["241773", "9E7C0C"] },
  { abbr: "CIN", city: "Cincinnati", nickname: "Bengals", division: "AFC North", colors: ["FB4F14", WHITE] },
  { abbr: "CLE", city: "Cleveland", nickname: "Browns", division: "AFC North", colors: ["FF3C00", WHITE] },
  { abbr: "PIT", city: "Pittsburgh", nickname: "Steelers", division: "AFC North", colors: ["FFB612", WHITE] },

  { abbr: "HOU", city: "Houston", nickname: "Texans", division: "AFC South", colors: ["A71930", "03202F"] },
  { abbr: "IND", city: "Indianapolis", nickname: "Colts", division: "AFC South", colors: ["002C5F", WHITE] },
  { abbr: "JAX", city: "Jacksonville", nickname: "Jaguars", division: "AFC South", colors: ["006778", "D7A22A"], aliases: ["JAC", "jags"] },
  { abbr: "TEN", city: "Tennessee", nickname: "Titans", division: "AFC South", colors: ["4B92DB", "C8102E"] },

  { abbr: "DEN", city: "Denver", nickname: "Broncos", division: "AFC West", colors: ["FB4F14", "002244"] },
  { abbr: "KC", city: "Kansas City", nickname: "Chiefs", division: "AFC West", colors: ["E31837", "FFB81C"], aliases: ["KAN"] },
  { abbr: "LV", city: "Las Vegas", nickname: "Raiders", division: "AFC West", colors: [WHITE], aliases: ["LVR", "vegas"] },
  { abbr: "LAC", city: "Los Angeles", nickname: "Chargers", division: "AFC West", colors: ["0080C6", "FFC20E"], aliases: ["bolts"] },

  { abbr: "DAL", city: "Dallas", nickname: "Cowboys", division: "NFC East", colors: ["003594", WHITE] },
  { abbr: "NYG", city: "New York", nickname: "Giants", division: "NFC East", colors: ["0B2265", "A71930"] },
  { abbr: "PHI", city: "Philadelphia", nickname: "Eagles", division: "NFC East", colors: ["004C54", WHITE] },
  { abbr: "WSH", city: "Washington", nickname: "Commanders", division: "NFC East", colors: ["5A1414", "FFB612"], aliases: ["WAS"] },

  { abbr: "CHI", city: "Chicago", nickname: "Bears", division: "NFC North", colors: ["C83803", "0B162A"] },
  { abbr: "DET", city: "Detroit", nickname: "Lions", division: "NFC North", colors: ["0076B6", WHITE] },
  { abbr: "GB", city: "Green Bay", nickname: "Packers", division: "NFC North", colors: ["00703C", "FFB612"], aliases: ["GNB"] },
  { abbr: "MIN", city: "Minnesota", nickname: "Vikings", division: "NFC North", colors: ["4F2683", "FFC62F"], aliases: ["vikes"] },

  { abbr: "ATL", city: "Atlanta", nickname: "Falcons", division: "NFC South", colors: ["A71930", WHITE] },
  { abbr: "CAR", city: "Carolina", nickname: "Panthers", division: "NFC South", colors: ["0085CA", WHITE] },
  { abbr: "NO", city: "New Orleans", nickname: "Saints", division: "NFC South", colors: ["CFA54B", WHITE], aliases: ["NOR"] },
  { abbr: "TB", city: "Tampa Bay", nickname: "Buccaneers", division: "NFC South", colors: ["D50A0A", "FF7900"], aliases: ["TAM", "bucs", "tampa"] },

  { abbr: "ARI", city: "Arizona", nickname: "Cardinals", division: "NFC West", colors: ["97233F", "FFB612"], aliases: ["ARZ", "cards"] },
  { abbr: "LAR", city: "Los Angeles", nickname: "Rams", division: "NFC West", colors: ["003594", "FFD100"], aliases: ["LA"] },
  { abbr: "SF", city: "San Francisco", nickname: "49ers", division: "NFC West", colors: ["AA0000", "B3995D"], aliases: ["SFO", "niners"] },
  { abbr: "SEA", city: "Seattle", nickname: "Seahawks", division: "NFC West", colors: ["002244", "69BE28"], aliases: ["hawks"] },
];

export const NFL_LEAGUE = "football/nfl";

export const fullName = (team: NflTeam): string => `${team.city} ${team.nickname}`;

/**
 * Look a team up by abbreviation, alias, nickname, full name or city.
 * A city shared by two teams ("New York", "Los Angeles") matches neither.
 */
export function findNflTeam(query: string): NflTeam | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const exact = NFL_TEAMS.find(
    (t) =>
      t.abbr.toLowerCase() === q ||
      t.nickname.toLowerCase() === q ||
      fullName(t).toLowerCase() === q ||
      t.aliases?.some((a) => a.toLowerCase() === q),
  );
  if (exact) return exact;
  const byCity = NFL_TEAMS.filter((t) => t.city.toLowerCase() === q);
  return byCity.length === 1 ? byCity[0] : undefined;
}

/** Like `findNflTeam`, but explains what went wrong. */
export function requireNflTeam(query: string): NflTeam {
  const team = findNflTeam(query);
  if (team) return team;
  const sameCity = NFL_TEAMS.filter((t) => t.city.toLowerCase() === query.trim().toLowerCase());
  if (sameCity.length > 1) {
    throw new Error(`"${query}" has ${sameCity.length} teams: use ${sameCity.map((t) => t.abbr).join(" or ")}.`);
  }
  throw new Error(`"${query}" is not an NFL team. Use one of: ${NFL_TEAMS.map((t) => t.abbr).join(", ")}.`);
}
