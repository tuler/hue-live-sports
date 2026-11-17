import { existsSync, readFileSync } from "node:fs";
import type { Signal } from "./hue.js";

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
  /** Team abbreviation as ESPN shows it ("NYG"), or its full display name. */
  team: string;
  /** Name of the Hue room or zone to flash. */
  group: string;
  /** How often to poll while the game is live. */
  pollSeconds: number;
  /** Hold effects back this long, to line up with a delayed TV stream. */
  delaySeconds: number;
  /** "signal": bridge-run effect. "pulse": manual flashing with state restore. */
  effectMode: "signal" | "pulse";
  effects: Record<string, Effect>;
}

const on = (seconds: number, signal: Signal = "on_off_color"): Effect => ({ enabled: true, seconds, signal });
const off: Effect = { enabled: false, seconds: 0, signal: "on_off_color" };

/** Keys are `<side>.<kind>` with a `<side>.score` fallback, plus game-level events. */
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
  game_start: on(5),
  win: on(15, "alternating"),
  loss: off,
  draw: off,
};

export const DEFAULT_CONFIG_PATH = "config.json";

export function loadEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

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

  return {
    league: text("league"),
    team: text("team"),
    group: text("group"),
    // ESPN refreshes no faster than every few seconds; polling harder gains nothing.
    pollSeconds: seconds("pollSeconds", 10, 5),
    delaySeconds: seconds("delaySeconds", 0, 0),
    effectMode,
    effects,
  };
}

export function effectFor(config: Config, keys: string[]): Effect | undefined {
  for (const key of keys) {
    const effect = config.effects[key];
    if (effect) return effect.enabled ? effect : undefined;
  }
  return undefined;
}
