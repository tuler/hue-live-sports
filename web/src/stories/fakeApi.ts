/**
 * A stand-in for the Worker's `/api`, so stories can show any state without a
 * server. Each story sets `parameters.api` to override routes; the rest
 * answer from the fixtures below.
 */
import type { Group, Me, Settings, Team } from "../api.ts";

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
  game_start: effect(false, 0),
  win: effect(true, 10, "alternating"),
  draw: effect(false, 0),
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
  league: "nfl",
  teams: ["LAC", "KC"],
  group: "Living Room",
  delaySeconds: 20,
  effectMode: "signal",
  effects: DEFAULT_EFFECTS,
};

const me = (settings?: Settings): Me => ({
  bridge: "001788fffe4dbe1a",
  connected: true,
  settings,
  leagues: LEAGUES,
  effectKeys: Object.keys(DEFAULT_EFFECTS),
  defaults: { league: "nfl", teams: [], delaySeconds: 0, effectMode: "signal", effects: DEFAULT_EFFECTS },
});

export const ME_SAVED = me(SAVED);
export const ME_NEW = me(undefined);

export const GROUPS: Group[] = [
  { name: "Living Room", kind: "room" },
  { name: "Kitchen", kind: "room" },
  { name: "Bedroom", kind: "room" },
  { name: "TV area", kind: "zone" },
];

const team = (abbreviation: string, name: string, ...colors: string[]): Team => ({
  abbreviation,
  name,
  colors: colors.map((c) => `#${c}`),
  color: colors[0],
  alternateColor: colors[1],
});

export const TEAMS: Record<string, Team[]> = {
  nfl: [
    team("BUF", "Buffalo Bills", "00338D", "C60C30"),
    team("DAL", "Dallas Cowboys", "003594", "FFFFFF"),
    team("GB", "Green Bay Packers", "203731", "FFB612"),
    team("KC", "Kansas City Chiefs", "E31837", "FFB81C"),
    team("LAC", "Los Angeles Chargers", "0080C6", "FFC20E"),
    team("NYG", "New York Giants", "0B2265", "A71930"),
    team("PHI", "Philadelphia Eagles", "004C54", "A5ACAF"),
    team("SF", "San Francisco 49ers", "AA0000", "B3995D"),
  ],
  epl: [
    team("ARS", "Arsenal", "E20520", "FFFFFF"),
    team("CHE", "Chelsea", "034694", "FFFFFF"),
    team("LIV", "Liverpool", "D11317", "F6EB61"),
    team("MCI", "Manchester City", "99C5EA", "FFFFFF"),
    team("TOT", "Tottenham Hotspur", "132257"),
  ],
};

/** What a working Worker answers. */
export const DEFAULT_ROUTES: FakeRoutes = {
  "GET /api/me": ME_SAVED,
  "GET /api/groups": GROUPS,
  "GET /api/teams": (url: URL) => TEAMS[url.searchParams.get("league") ?? "nfl"] ?? TEAMS.nfl,
  "PUT /api/settings": (_url: URL, body: unknown) => ({ settings: body }),
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
