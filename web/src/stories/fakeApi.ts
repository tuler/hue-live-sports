/**
 * A stand-in for the Worker's `/api`, so stories can show any state without a
 * server. Each story sets `parameters.api` to override routes; the rest
 * answer from the fixtures below.
 */
import type { FollowedGame, Game, GameTeam, Group, Me, Settings } from "../api.ts";

/** A route's answer: a JSON body (status 200), `{ status, body }`, or "pending" for a request that never settles. */
export type FakeReply = unknown;
/** Keys are "METHOD /path", e.g. "GET /api/groups". Query strings are matched too when given. */
export type FakeRoutes = Record<string, FakeReply | ((url: URL, body: unknown) => FakeReply)>;

const effect = (enabled: boolean, seconds: number, signal: "alternating" | "on_off_color" = "on_off_color") => ({
  enabled,
  seconds,
  signal,
});

export const DEFAULT_EFFECTS: Settings["effects"] = {
  touchdown: effect(true, 10, "alternating"),
  goal: effect(true, 10, "alternating"),
  field_goal: effect(true, 5),
  run: effect(true, 5),
  two_points: effect(true, 3),
  extra_point: effect(false, 0),
  basket: effect(false, 0),
  score: effect(true, 5),
  game_start: effect(true, 5, "alternating"),
  win: effect(true, 10, "alternating"),
  draw: effect(true, 5, "alternating"),
};

const LEAGUES: Me["leagues"] = [
  { id: "nfl", name: "NFL", sport: "football" },
  { id: "nba", name: "NBA", sport: "basketball" },
  { id: "mlb", name: "MLB", sport: "baseball" },
  { id: "nhl", name: "NHL", sport: "hockey" },
  { id: "epl", name: "Premier League", sport: "soccer" },
  { id: "brasileirao", name: "Brasileirão", sport: "soccer" },
];

export const SAVED: Settings = {
  group: "Living Room",
  delaySeconds: 20,
  effectMode: "signal",
  effects: DEFAULT_EFFECTS,
};

const team = (abbreviation: string, name: string, colors: string[], score?: number): GameTeam => ({
  abbreviation,
  name,
  colors: colors.map((c) => `#${c}`),
  color: colors[0],
  alternateColor: colors[1],
  ...(score === undefined ? {} : { score }),
});

/** Hours from now, as an ISO time, so "Today" and "Tomorrow" stay true whenever the story is opened. */
const inHours = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

const key = (a: string, b: string) => [a, b].map((t) => t.toLowerCase()).sort().join("-");

const live = (league: string, away: GameTeam, home: GameTeam, detail: string): Game => ({
  key: key(away.abbreviation, home.abbreviation),
  league,
  name: `${away.abbreviation} @ ${home.abbreviation}`,
  state: "in",
  detail,
  startsAt: inHours(-1.5),
  home,
  away,
});

const upcoming = (league: string, away: GameTeam, home: GameTeam, hours: number): Game => ({
  key: key(away.abbreviation, home.abbreviation),
  league,
  name: `${away.abbreviation} @ ${home.abbreviation}`,
  state: "pre",
  detail: "Scheduled",
  startsAt: inHours(hours),
  home: { ...home, score: 0 },
  away: { ...away, score: 0 },
});

export const GAMES: Record<string, Game[]> = {
  nfl: [
    live("nfl", team("KC", "Kansas City Chiefs", ["E31837", "FFB81C"], 17), team("LAC", "Los Angeles Chargers", ["0080C6", "FFC20E"], 14), "8:41 - 3rd"),
    live("nfl", team("DAL", "Dallas Cowboys", ["003594", "FFFFFF"], 3), team("NYG", "New York Giants", ["0B2265", "A71930"], 10), "Halftime"),
    upcoming("nfl", team("SF", "San Francisco 49ers", ["AA0000", "B3995D"]), team("GB", "Green Bay Packers", ["00703C", "FFB612"]), 3),
    upcoming("nfl", team("BUF", "Buffalo Bills", ["00338D", "C60C30"]), team("PHI", "Philadelphia Eagles", ["004C54", "FFFFFF"]), 22),
  ],
  epl: [
    live("epl", team("ARS", "Arsenal", ["E20520", "FFFFFF"], 1), team("LIV", "Liverpool", ["D11317", "F6EB61"], 1), "67'"),
    upcoming("epl", team("TOT", "Tottenham Hotspur", ["132257"]), team("MCI", "Manchester City", ["99C5EA", "FFFFFF"]), 5),
  ],
};

const bare = ({ score: _, ...t }: GameTeam): GameTeam => t;
const followed = ({ key, league, name, startsAt, home, away }: Game): FollowedGame => ({
  key,
  league,
  name,
  startsAt,
  home: bare(home),
  away: bare(away),
});

/** Following the Chiefs at the Chargers, live. */
export const FOLLOWING = followed(GAMES.nfl![0]!);

const me = (settings?: Settings, game?: FollowedGame): Me => ({
  bridge: "001788fffe4dbe1a",
  connected: true,
  settings,
  game,
  leagues: LEAGUES,
  effectKeys: Object.keys(DEFAULT_EFFECTS),
  defaults: { delaySeconds: 0, effectMode: "signal", effects: DEFAULT_EFFECTS },
});

export const ME_SAVED = me(SAVED, FOLLOWING);
export const ME_NOT_FOLLOWING = me(SAVED);
export const ME_NEW = me(undefined);

export const GROUPS: Group[] = [
  { name: "Living Room", kind: "room" },
  { name: "Kitchen", kind: "room" },
  { name: "Bedroom", kind: "room" },
  { name: "TV area", kind: "zone" },
];

/** What a working Worker answers. */
export const DEFAULT_ROUTES: FakeRoutes = {
  "GET /api/me": ME_SAVED,
  "GET /api/groups": GROUPS,
  "GET /api/games": (url: URL) => GAMES[url.searchParams.get("league") ?? "nfl"] ?? [],
  "PUT /api/settings": (_url: URL, body: unknown) => ({ settings: body }),
  "PUT /api/game": (_url: URL, body: unknown) => {
    const { league, key } = body as { league: string; key: string };
    const game = GAMES[league]?.find((g) => g.key === key);
    return game ? { game: followed(game) } : { status: 404, body: { error: "That game is not live or coming up any more." } };
  },
  "DELETE /api/game": { ok: true },
  "POST /api/test": { result: 'Played "touchdown" on Living Room for 10s' },
  "DELETE /api/me": { ok: true },
  "POST /auth/signout": { ok: true },
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A `fetch` that answers `/api` and `/auth` from `routes`, after a short, realistic pause. */
export function fakeFetch(routes: FakeRoutes, delayMs = 250): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input), location.href);
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes[`${method} ${url.pathname}${url.search}`] ?? routes[`${method} ${url.pathname}`];
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    let reply = typeof route === "function" ? route(url, body) : route;
    if (route === undefined) reply = { status: 404, body: { error: "not found" } };
    if (reply === "pending") return new Promise<Response>(() => {});
    await pause(delayMs);
    const explicit = typeof reply === "object" && reply !== null && "status" in reply && typeof reply.status === "number";
    const status = explicit ? (reply as { status: number }).status : 200;
    const json = explicit ? (reply as { body?: unknown }).body : reply;
    return Response.json(json ?? {}, { status });
  }) as typeof fetch;
}

/** Shorthand for a failing route. */
export const failWith = (status: number, error: string): FakeReply => ({ status, body: { error } });
