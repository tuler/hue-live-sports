import { resolveLeague } from "./espn.ts";
import { EFFECT_KEYS } from "./events.ts";
import type { Signal } from "./hue.ts";
import { ADAPTERS } from "./sources/webhook.ts";

export interface Effect {
  enabled: boolean;
  seconds: number;
  signal: Signal;
  /** Hex colours to use instead of the scoring team's own. */
  colors?: string[];
}

/**
 * One viewer's lasting choices, shared by the local config file and a Worker
 * user. Which game to follow is not one of them: that is picked per game (see
 * `FollowedGame`).
 */
export interface Settings {
  /** Name of the Hue room or zone to flash. */
  group: string;
  /** Hold effects back this long, to line up with a delayed TV stream. */
  delaySeconds: number;
  /** "signal": bridge-run effect. "pulse": manual flashing with state restore. */
  effectMode: "signal" | "pulse";
  effects: Record<string, Effect>;
}

/** The local service: settings plus where its scores come from. */
export interface Config extends Settings {
  /** Alias ("nfl", "epl") or ESPN path ("soccer/eng.1"): the scoreboard to pick a game from. */
  league: string;
  /** Poll ESPN's scoreboard. On by default; turn off to rely on webhooks alone. */
  poll: boolean;
  /** How often to poll while a game is live. */
  pollSeconds: number;
  /** Receive pushed score updates over HTTP, alongside or instead of polling. */
  webhook?: WebhookConfig;
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
 * Keys are score kinds (`touchdown`, `goal`, ...) with a `score` fallback,
 * plus `game_start`, `win` and `draw`. See `EFFECT_KEYS`.
 */
export const DEFAULT_EFFECTS: Record<string, Effect> = {
  touchdown: on(10, "alternating"),
  goal: on(10, "alternating"),
  field_goal: on(5),
  run: on(5),
  two_points: on(3),
  // Off: it follows nearly every touchdown, straight after that flash.
  extra_point: off,
  basket: off,
  score: on(5),
  // Kickoff and draw have no scoring team, so they alternate both teams' colours.
  game_start: on(5, "alternating"),
  win: on(10, "alternating"),
  draw: on(5, "alternating"),
};

const fields = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Config must be a JSON object");
  return raw as Record<string, unknown>;
};

const seconds = (c: Record<string, unknown>, key: string, fallback: number, min: number): number => {
  const v = c[key] ?? fallback;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min) {
    throw new Error(`Config "${key}" must be a number >= ${min}`);
  }
  return v;
};

export function parseConfig(raw: unknown): Config {
  const c = fields(raw);
  const poll = c.poll ?? true;
  if (typeof poll !== "boolean") throw new Error('Config "poll" must be true or false');
  const webhook = parseWebhook(c.webhook);
  if (!poll && !webhook) throw new Error('Config has no score source: enable "poll" or "webhook"');
  const league = c.league;
  if (typeof league !== "string" || league.trim() === "") throw new Error('Config "league" must be a non-empty string');
  resolveLeague(league);
  return {
    ...parseSettings(c),
    league: league.trim(),
    poll,
    webhook,
    // ESPN refreshes no faster than every few seconds; polling harder gains nothing.
    pollSeconds: seconds(c, "pollSeconds", 10, 5),
  };
}

export function parseSettings(raw: unknown): Settings {
  const c = fields(raw);
  if (typeof c.group !== "string" || c.group.trim() === "") throw new Error('Config "group" must be a non-empty string');
  const effectMode = c.effectMode ?? "signal";
  if (effectMode !== "signal" && effectMode !== "pulse") {
    throw new Error('Config "effectMode" must be "signal" or "pulse"');
  }

  const effects = { ...DEFAULT_EFFECTS };
  for (const [key, value] of Object.entries((c.effects ?? {}) as Record<string, Partial<Effect>>)) {
    if (!EFFECT_KEYS.includes(key)) {
      const plain = key.replace(/^(us|them|any)\./, "");
      const hint = plain !== key && EFFECT_KEYS.includes(plain) ? ` Effects no longer have sides: use "${plain}".` : "";
      throw new Error(`Unknown effect "${key}".${hint} Known effects: ${EFFECT_KEYS.join(", ")}`);
    }
    const base = effects[key] ?? on(5);
    const merged: Effect = { ...base, ...value, enabled: value.enabled ?? true };
    if (merged.signal !== "alternating" && merged.signal !== "on_off_color") {
      throw new Error(`Effect "${key}": signal must be "alternating" or "on_off_color"`);
    }
    if (merged.enabled && !(merged.seconds >= 1)) throw new Error(`Effect "${key}": seconds must be >= 1`);
    effects[key] = merged;
  }

  return { group: c.group.trim(), delaySeconds: seconds(c, "delaySeconds", 0, 0), effectMode, effects };
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

export function effectFor(config: Pick<Settings, "effects">, keys: string[]): Effect | undefined {
  for (const key of keys) {
    const effect = config.effects[key];
    if (effect) return effect.enabled ? effect : undefined;
  }
  return undefined;
}
