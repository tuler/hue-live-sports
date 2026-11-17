/**
 * Client for ESPN's public scoreboard JSON.
 * The endpoint is undocumented and unsupported, so parsing is defensive:
 * anything unexpected is skipped rather than thrown.
 */

import { canonicalAbbreviation } from "./nfl.ts";

export type GameState = "pre" | "in" | "post";
export type Sport = "football" | "soccer" | "hockey" | "baseball" | "basketball" | "other";

export interface TeamSide {
  id: string;
  abbreviation: string;
  name: string;
  homeAway: "home" | "away";
  score: number;
  /** Hex without "#", as ESPN reports it. */
  color?: string;
  alternateColor?: string;
}

export interface GameSnapshot {
  id: string;
  name: string;
  sport: Sport;
  state: GameState;
  /** Human-readable clock, e.g. "4:12 - 3rd". */
  detail: string;
  teams: TeamSide[];
  /** When the source observed this state (ms since epoch), if it says. */
  asOf?: number;
}

/** Short aliases for ESPN's "sport/league" path segments. */
export const LEAGUES: Record<string, string> = {
  nfl: "football/nfl",
  ncaaf: "football/college-football",
  nba: "basketball/nba",
  wnba: "basketball/wnba",
  nhl: "hockey/nhl",
  mlb: "baseball/mlb",
  mls: "soccer/usa.1",
  epl: "soccer/eng.1",
  laliga: "soccer/esp.1",
  bundesliga: "soccer/ger.1",
  seriea: "soccer/ita.1",
  ligue1: "soccer/fra.1",
  brasileirao: "soccer/bra.1",
  ucl: "soccer/uefa.champions",
};

/** Accepts an alias ("nfl") or a raw ESPN path ("soccer/eng.1"). */
export function resolveLeague(league: string): string {
  const key = league.trim().toLowerCase();
  const path = LEAGUES[key] ?? key;
  if (!/^[a-z-]+\/[a-z0-9.-]+$/.test(path)) {
    throw new Error(
      `Unknown league "${league}". Use one of ${Object.keys(LEAGUES).join(", ")} or an ESPN path like "soccer/eng.1".`,
    );
  }
  return path;
}

export function sportOf(leaguePath: string): Sport {
  const sport = leaguePath.split("/")[0];
  switch (sport) {
    case "football":
    case "soccer":
    case "hockey":
    case "baseball":
    case "basketball":
      return sport;
    default:
      return "other";
  }
}

export function scoreboardUrl(leaguePath: string): string {
  return `https://site.api.espn.com/apis/site/v2/sports/${leaguePath}/scoreboard`;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : typeof v === "number" ? String(v) : undefined;

function parseScore(v: unknown): number {
  // Usually a string ("21"); some ESPN endpoints use { value: 21 }.
  const raw = obj(v)?.value ?? v;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseTeam(v: unknown, leaguePath: string): TeamSide | undefined {
  const c = obj(v);
  const team = obj(c?.team);
  const id = str(team?.id) ?? str(c?.id);
  const raw = str(team?.abbreviation);
  if (!c || !team || !id || !raw) return undefined;
  const abbreviation = canonicalAbbreviation(leaguePath, raw);
  return {
    id,
    abbreviation,
    name: str(team.displayName) ?? str(team.name) ?? abbreviation,
    homeAway: c.homeAway === "away" ? "away" : "home",
    score: parseScore(c.score),
    color: str(team.color),
    alternateColor: str(team.alternateColor),
  };
}

export function parseScoreboard(json: unknown, leaguePath: string): GameSnapshot[] {
  const sport = sportOf(leaguePath);
  const games: GameSnapshot[] = [];
  for (const e of arr(obj(json)?.events)) {
    const event = obj(e);
    const competition = obj(arr(event?.competitions)[0]);
    const id = str(event?.id);
    if (!event || !competition || !id) continue;
    const teams = arr(competition.competitors)
      .map((c) => parseTeam(c, leaguePath))
      .filter((t): t is TeamSide => t !== undefined);
    if (teams.length !== 2) continue;
    const type = obj(obj(competition.status ?? event.status)?.type);
    const state = type?.state === "in" || type?.state === "post" ? type.state : "pre";
    games.push({
      id,
      name: str(event.shortName) ?? str(event.name) ?? teams.map((t) => t.abbreviation).join(" v "),
      sport,
      state,
      detail: str(type?.shortDetail) ?? str(type?.detail) ?? state,
      teams,
    });
  }
  return games;
}

export async function fetchScoreboard(
  leaguePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GameSnapshot[]> {
  const res = await fetchImpl(scoreboardUrl(leaguePath), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ESPN scoreboard returned HTTP ${res.status}`);
  return parseScoreboard(await res.json(), leaguePath);
}

export function isTeam(side: TeamSide, team: string): boolean {
  const q = team.trim().toLowerCase();
  return side.abbreviation.toLowerCase() === q || side.name.toLowerCase() === q;
}

export const isAnyTeam = (side: TeamSide, teams: readonly string[]): boolean =>
  teams.some((team) => isTeam(side, team));

/** The games to watch: every game, or only those involving one of `teams`. */
export function followedGames(games: GameSnapshot[], teams: readonly string[]): GameSnapshot[] {
  if (teams.length === 0) return games;
  return games.filter((g) => g.teams.some((t) => isAnyTeam(t, teams)));
}
