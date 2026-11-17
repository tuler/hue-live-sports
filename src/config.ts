import { existsSync, readFileSync } from "node:fs";
import { resolveLeague } from "./espn.ts";
import type { Signal } from "./hue.ts";
import { NFL_LEAGUE, requireNflTeam } from "./nfl.ts";
import { ADAPTERS } from "./sources/webhook.ts";

export interface Effect {
  enabled: boolean;
  seconds: number;
  signal: Signal;
  /** Hex colours to use instead of the scoring team's own. */
  colors?: string[];
}

export interface Config {
  /** Alias ("nfl", "epl") or ESPN path ("soccer/eng.1"). */
  league: string;
  /**
   * Teams to follow. Empty (the default) follows every game in the league and
   * treats all teams alike. Otherwise only these teams' games are followed,
   * and effects distinguish "us" from "them".
   *
   * Entries are ESPN abbreviations or full display names. For the NFL any of
   * the 32 teams by abbreviation, nickname or full name ("Giants"), stored
   * here as abbreviations.
   */
  teams: string[];
  /** Name of the Hue room or zone to flash. */
  group: string;
  /** Poll ESPN's scoreboard. On by default; turn off to rely on webhooks alone. */
  poll: boolean;
  /** How often to poll while a game is live. */
  pollSeconds: number;
  /** Receive pushed score updates over HTTP, alongside or instead of polling. */
  webhook?: WebhookConfig;
  /** Hold effects back this long, to line up with a delayed TV stream. */
  delaySeconds: number;
  /** "signal": bridge-run effect. "pulse": manual flashing with state restore. */
  effectMode: "signal" | "pulse";
  effects: Record<string, Effect>;
}

export interface WebhookConfig {
  /** Interface to listen on. Loopback by default: put a tunnel or proxy in front. */
  host: string;
  port: number;
  path: string;
  /** Payload format, a key of `ADAPTERS` in src/sources/webhook.ts. */
  adapter: string;
}

const on = (seconds: number, signal: Signal = "on_off_color"): Effect => ({ enabled: true, seconds, signal });
const off: Effect = { enabled: false, seconds: 0, signal: "on_off_color" };

/**
 * Keys are `<side>.<kind>` with a `<side>.score` fallback, plus game-level
 * events. Sides are `us` and `them` in a followed team's game, `any` elsewhere.
 */
export const DEFAULT_EFFECTS: Record<string, Effect> = {
  "us.touchdown": on(10, "alternating"),
  "us.goal": on(10, "alternating"),
  "us.field_goal": on(5),
  "us.run": on(5),
  "us.two_points": on(3),
  "us.extra_point": on(2),
  "us.basket": off,
  "us.score": on(5),
  "them.extra_point": off,
  "them.basket": off,
  "them.score": on(3),
  // Games without a followed team. Shorter, since several can be live at once.
  "any.touchdown": on(6, "alternating"),
  "any.goal": on(6, "alternating"),
  "any.field_goal": on(3),
  "any.run": on(3),
  "any.two_points": on(2),
  "any.extra_point": off,
  "any.basket": off,
  "any.score": on(3),
  "any.game_start": off,
  "any.final": on(5, "alternating"),
  game_start: on(5),
  win: on(15, "alternating"),
  loss: off,
  draw: off,
};

export const DEFAULT_CONFIG_PATH = "config.json";

export function loadConfig(path = DEFAULT_CONFIG_PATH): Config {
  if (!existsSync(path)) {
    throw new Error(`Config file "${path}" not found. Copy config.example.json to ${path} and edit it.`);
  }
  return parseConfig(JSON.parse(readFileSync(path, "utf8")));
}

export function parseConfig(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null) throw new Error("Config must be a JSON object");
  const c = raw as Record<string, unknown>;
  const text = (key: string): string => {
    const v = c[key];
    if (typeof v !== "string" || v.trim() === "") throw new Error(`Config "${key}" must be a non-empty string`);
    return v.trim();
  };
  const seconds = (key: string, fallback: number, min: number): number => {
    const v = c[key] ?? fallback;
    if (typeof v !== "number" || !Number.isFinite(v) || v < min) {
      throw new Error(`Config "${key}" must be a number >= ${min}`);
    }
    return v;
  };
  const effectMode = c.effectMode ?? "signal";
  if (effectMode !== "signal" && effectMode !== "pulse") {
    throw new Error('Config "effectMode" must be "signal" or "pulse"');
  }

  const effects = { ...DEFAULT_EFFECTS };
  for (const [key, value] of Object.entries((c.effects ?? {}) as Record<string, Partial<Effect>>)) {
    const base = effects[key] ?? on(5);
    const merged: Effect = { ...base, ...value, enabled: value.enabled ?? true };
    if (merged.signal !== "alternating" && merged.signal !== "on_off_color") {
      throw new Error(`Effect "${key}": signal must be "alternating" or "on_off_color"`);
    }
    if (merged.enabled && !(merged.seconds >= 1)) throw new Error(`Effect "${key}": seconds must be >= 1`);
    effects[key] = merged;
  }

  const league = text("league");
  // `team` is shorthand for a one-entry `teams`.
  const listed = c.teams ?? (c.team === undefined ? [] : [c.team]);
  if (!Array.isArray(listed) || listed.some((t) => typeof t !== "string" || t.trim() === "")) {
    throw new Error('Config "teams" must be a list of team names');
  }
  const nfl = resolveLeague(league) === NFL_LEAGUE;
  const teams = [...new Set((listed as string[]).map((t) => (nfl ? requireNflTeam(t).abbr : t.trim())))];

  const poll = c.poll ?? true;
  if (typeof poll !== "boolean") throw new Error('Config "poll" must be true or false');
  const webhook = parseWebhook(c.webhook);
  if (!poll && !webhook) throw new Error('Config has no score source: enable "poll" or "webhook"');

  return {
    league,
    teams,
    poll,
    webhook,
    group: text("group"),
    // ESPN refreshes no faster than every few seconds; polling harder gains nothing.
    pollSeconds: seconds("pollSeconds", 10, 5),
    delaySeconds: seconds("delaySeconds", 0, 0),
    effectMode,
    effects,
  };
}

function parseWebhook(raw: unknown): WebhookConfig | undefined {
  if (raw === undefined || raw === null || raw === false) return undefined;
  const w = (raw === true ? {} : raw) as Record<string, unknown>;
  if (typeof w !== "object") throw new Error('Config "webhook" must be an object');
  if (w.enabled === false) return undefined;
  const { host = "127.0.0.1", port = 8787, path = "/webhook", adapter = "generic" } = w;
  if (typeof host !== "string" || host === "") throw new Error('Config "webhook.host" must be a host name or address');
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Config "webhook.port" must be a port number');
  }
  if (typeof path !== "string" || !path.startsWith("/")) throw new Error('Config "webhook.path" must start with "/"');
  if (typeof adapter !== "string" || !(adapter in ADAPTERS)) {
    throw new Error(`Config "webhook.adapter" must be one of: ${Object.keys(ADAPTERS).join(", ")}`);
  }
  return { host, port, path, adapter };
}

export function effectFor(config: Config, keys: string[]): Effect | undefined {
  for (const key of keys) {
    const effect = config.effects[key];
    if (effect) return effect.enabled ? effect : undefined;
  }
  return undefined;
}
