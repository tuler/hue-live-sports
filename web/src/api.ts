/** The Worker's `/api`, as the settings page sees it. Shapes mirror src/config.ts and src/worker/index.ts. */

export type Signal = "alternating" | "on_off_color";

export interface Effect {
  enabled: boolean;
  seconds: number;
  signal: Signal;
  colors?: string[];
}

export interface Settings {
  league: string;
  /** Empty means every team in the league. */
  teams: string[];
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
  teams: (league: string) => call<Team[]>("GET", `/api/teams?league=${encodeURIComponent(league)}`),
  save: (settings: Settings) => call<{ settings: Settings }>("PUT", "/api/settings", settings),
  test: (effect: string, team: Pick<Team, "abbreviation" | "color" | "alternateColor">) =>
    call<{ result: string }>("POST", "/api/test", { effect, team }),
  disconnect: () => call<{ ok: true }>("DELETE", "/api/me"),
  signOut: () => fetch("/auth/signout", { method: "POST" }),
};
