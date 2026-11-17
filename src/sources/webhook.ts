/**
 * Receives score updates pushed over HTTP.
 *
 * `createWebhookHandler` is a plain `Request -> Response` function with no
 * Bun-specific calls, so the same handler can sit behind `Bun.serve` here or
 * be the `fetch` export of a Cloudflare Worker later.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { sportOf, type GameSnapshot, type GameState } from "../espn.ts";
import type { SportsEvent } from "../events.ts";
import { canonicalAbbreviation, findNflTeam, NFL_LEAGUE } from "../nfl.ts";
import type { Tracker } from "../tracker.ts";

export const WEBHOOK_SOURCE = "webhook";
const MAX_BODY_BYTES = 256 * 1024;
/** A signed request older or newer than this is refused, to limit replays. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

/** Translates one provider's webhook into game snapshots. */
export interface WebhookAdapter {
  name: string;
  /** Whether the request was signed with `secret`. `body` is the raw text. */
  verify(headers: Headers, body: string, secret: string, nowMs: number): boolean;
  /** Throw `WebhookError` for a payload this adapter cannot read. */
  parse(payload: unknown, league: string): GameSnapshot[];
}

export class WebhookError extends Error {}

const hmac = (secret: string, text: string): string => createHmac("sha256", secret).update(text).digest("hex");

/** Signature headers for the generic adapter. */
export function signGeneric(body: string, secret: string, nowMs = Date.now()): Record<string, string> {
  const timestamp = String(Math.floor(nowMs / 1000));
  return { "x-timestamp": timestamp, "x-signature": `sha256=${hmac(secret, `${timestamp}.${body}`)}` };
}

function parseGenericGame(raw: unknown, league: string): GameSnapshot {
  const g = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const side = (key: "home" | "away") => {
    const s = (typeof g[key] === "object" && g[key] !== null ? g[key] : {}) as Record<string, unknown>;
    if (typeof s.team !== "string" || s.team.trim() === "") throw new WebhookError(`"${key}.team" must be a team name`);
    if (typeof s.score !== "number" || !Number.isInteger(s.score) || s.score < 0) {
      throw new WebhookError(`"${key}.score" must be a non-negative integer`);
    }
    if (league === NFL_LEAGUE && !findNflTeam(s.team)) throw new WebhookError(`"${s.team}" is not an NFL team`);
    const abbreviation = canonicalAbbreviation(league, s.team);
    return { id: abbreviation, abbreviation, name: abbreviation, homeAway: key, score: s.score };
  };
  if (g.state !== "pre" && g.state !== "in" && g.state !== "post") {
    throw new WebhookError('"state" must be "pre", "in" or "post"');
  }
  const at = g.at === undefined ? undefined : Date.parse(String(g.at));
  if (at !== undefined && Number.isNaN(at)) throw new WebhookError('"at" must be an ISO 8601 time');
  const teams = [side("home"), side("away")];
  if (teams[0]!.abbreviation.toLowerCase() === teams[1]!.abbreviation.toLowerCase()) {
    throw new WebhookError("home and away are the same team");
  }
  const state: GameState = g.state;
  return {
    id: "",
    name: `${teams[1]!.abbreviation} @ ${teams[0]!.abbreviation}`,
    sport: sportOf(league),
    state,
    detail: typeof g.detail === "string" && g.detail ? g.detail : state,
    teams,
    asOf: at,
  };
}

/**
 * This project's own payload: the current state of one game, or a list of
 * them. It is what a small relay in front of any provider would send.
 *
 *   { "state": "in", "detail": "4:12 - 3rd", "at": "2026-11-22T18:41:07Z",
 *     "home": { "team": "NYG", "score": 7 }, "away": { "team": "DAL", "score": 0 } }
 *
 * Signed with `X-Timestamp` (Unix seconds) and
 * `X-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">`.
 */
export const genericAdapter: WebhookAdapter = {
  name: "generic",
  verify(headers, body, secret, nowMs) {
    const timestamp = headers.get("x-timestamp") ?? "";
    const given = (headers.get("x-signature") ?? "").replace(/^sha256=/, "");
    if (!/^\d+$/.test(timestamp) || Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) return false;
    const expected = Buffer.from(hmac(secret, `${timestamp}.${body}`));
    const actual = Buffer.from(given);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  },
  parse(payload, league) {
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { games?: unknown } | null)?.games)
        ? (payload as { games: unknown[] }).games
        : [payload];
    return list.map((g) => parseGenericGame(g, league));
  },
};

export const ADAPTERS: Record<string, WebhookAdapter> = { generic: genericAdapter };

export interface WebhookOptions {
  league: string;
  path: string;
  secret: string;
  adapter: WebhookAdapter;
  onEvents: (events: SportsEvent[]) => void;
  now?: () => number;
}

const reply = (status: number, body: Record<string, unknown>): Response => Response.json(body, { status });

/** Builds the request handler: verify, parse, update the tracker, answer fast. */
export function createWebhookHandler(tracker: Tracker, options: WebhookOptions): (req: Request) => Promise<Response> {
  const { league, path, secret, adapter, onEvents, now = Date.now } = options;
  return async (req) => {
    if (new URL(req.url).pathname !== path) return reply(404, { error: "not found" });
    if (req.method !== "POST") return reply(405, { error: "POST only" });
    const body = await req.text();
    if (body.length > MAX_BODY_BYTES) return reply(413, { error: "payload too large" });
    if (!adapter.verify(req.headers, body, secret, now())) return reply(401, { error: "bad signature" });

    let games: GameSnapshot[];
    try {
      games = adapter.parse(JSON.parse(body), league);
    } catch (err) {
      const invalid = err instanceof WebhookError;
      return reply(invalid ? 422 : 400, { error: invalid ? err.message : "body is not JSON" });
    }
    const events = tracker.update(games, WEBHOOK_SOURCE);
    // Effects are queued, not awaited: providers retry a slow answer.
    onEvents(events);
    return reply(200, { games: games.length, events: events.length });
  };
}

export interface WebhookServer {
  url: string;
  stop(): Promise<void>;
}

export function serveWebhook(
  tracker: Tracker,
  options: WebhookOptions & { host: string; port: number },
): WebhookServer {
  const server = Bun.serve({
    hostname: options.host,
    port: options.port,
    fetch: createWebhookHandler(tracker, options),
  });
  return {
    url: `http://${server.hostname}:${server.port}${options.path}`,
    stop: () => server.stop(true),
  };
}
