/** The Worker's `/api`, as the settings page sees it. Shapes mirror src/config.ts and src/worker/index.ts. */

export type Signal = "alternating" | "on_off_color";

export interface Effect {
  enabled: boolean;
  seconds: number;
  signal: Signal;
  colors?: string[];
}

/** Lasting choices. The game to follow is picked separately, per game. */
export interface Settings {
  group: string;
  delaySeconds: number;
  effectMode: "signal" | "pulse";
  effects: Record<string, Effect>;
}

export interface League {
  id: string;
  name: string;
  sport: "football" | "soccer" | "hockey" | "baseball" | "basketball" | "other";
}

export interface Me {
  bridge: string;
  connected: boolean;
  settings?: Settings;
  /** The game being followed, until its final. */
  game?: FollowedGame;
  leagues: League[];
  effectKeys: string[];
  defaults: Omit<Settings, "group">;
}

export interface Team {
  abbreviation: string;
  name: string;
  /** CSS colours for the swatches. */
  colors: string[];
  color?: string;
  alternateColor?: string;
}

export interface GameTeam extends Team {
  score?: number;
}

/** A game that can be followed: live, or starting within a day. */
export interface Game {
  /** The game's identity: its two teams, e.g. "dal-nyg". */
  key: string;
  /** League id, as in `Me.leagues`. */
  league: string;
  name: string;
  state: "pre" | "in";
  /** ESPN's short status: the clock while live, the kickoff time before. */
  detail: string;
  /** ISO time. */
  startsAt?: string;
  home: GameTeam;
  away: GameTeam;
}

/** The followed game as saved: no live score or status. */
export type FollowedGame = Pick<Game, "key" | "league" | "name" | "startsAt" | "home" | "away">;

export interface Group {
  name: string;
  kind: "room" | "zone";
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  me: () => call<Me>("GET", "/api/me"),
  groups: () => call<Group[]>("GET", "/api/groups"),
  games: (league: string) => call<Game[]>("GET", `/api/games?league=${encodeURIComponent(league)}`),
  save: (settings: Settings) => call<{ settings: Settings }>("PUT", "/api/settings", settings),
  follow: (game: Pick<Game, "league" | "key">) => call<{ game: FollowedGame }>("PUT", "/api/game", { league: game.league, key: game.key }),
  unfollow: () => call<{ ok: true }>("DELETE", "/api/game"),
  /** Without a team, the server uses the followed game's colours. */
  test: (effect: string, team?: Pick<Team, "abbreviation" | "color" | "alternateColor">) =>
    call<{ result: string }>("POST", "/api/test", { effect, team }),
  disconnect: () => call<{ ok: true }>("DELETE", "/api/me"),
  signOut: () => fetch("/auth/signout", { method: "POST" }),
};
