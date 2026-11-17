import { setTimeout as sleep } from "node:timers/promises";
import { lampColors, toLamp } from "./color.ts";
import { effectFor, type Config, type Effect } from "./config.ts";
import { resolveLeague, type GameSnapshot, type TeamSide } from "./espn.ts";
import { describe, forTeams, type SportsEvent } from "./events.ts";
import type { HueBridge, LightGroup } from "./hue.ts";
import type { XY } from "./color.ts";
import { findNflTeam, NFL_LEAGUE } from "./nfl.ts";
import { runPoller } from "./sources/poll.ts";
import { ADAPTERS, serveWebhook } from "./sources/webhook.ts";
import { Tracker } from "./tracker.ts";

export interface Lights {
  bridge: HueBridge;
  group: LightGroup;
}

const log = (msg: string) => console.log(`${new Date().toLocaleTimeString()}  ${msg}`);

/**
 * A team's lamp colours: the built-in table for NFL teams, else whatever the
 * scoreboard reports, else white.
 */
export function teamColors(
  league: string,
  side: Pick<TeamSide, "abbreviation" | "color" | "alternateColor"> | undefined,
): XY[] {
  const nfl = league === NFL_LEAGUE && side ? findNflTeam(side.abbreviation) : undefined;
  return nfl ? toLamp(nfl.colors) : lampColors(side?.color, side?.alternateColor);
}

/** Colours for an effect: its own override, else those of `team`. */
export function colorsFor(team: TeamSide, effect: Effect, league: string): XY[] {
  return effect.colors?.length ? toLamp(effect.colors) : teamColors(league, team);
}

export async function play(lights: Lights, config: Config, effect: Effect, colors: XY[]): Promise<void> {
  if (config.effectMode === "pulse") await lights.bridge.pulse(lights.group, effect.seconds, colors);
  else await lights.bridge.signal(lights.group, effect.signal, effect.seconds, colors);
}

/**
 * An effect that would start this late is dropped: with many games live the
 * lights can fall behind, and a flash for a minute-old play means nothing.
 */
export const MAX_LAG_SECONDS = 45;

export interface Dispatcher {
  /** Log events and queue their effects. Returns at once. */
  handle(events: SportsEvent[]): void;
  /** Resolves when every queued effect has played. */
  idle(): Promise<void>;
}

/** Turns events into light effects, one at a time. Without `lights` it only logs. */
export function createDispatcher(config: Config, lights: Lights | undefined, league: string): Dispatcher {
  // Effects run one at a time so a touchdown and its extra point don't collide.
  let queue: Promise<void> = Promise.resolve();
  return {
    handle(events) {
      for (const event of events) {
        const mine = forTeams(event, config.teams);
        if (!mine) continue;
        log(describe(event));
        const effect = effectFor(config, mine.keys);
        if (!effect || !lights) continue;
        const colors = colorsFor(mine.team, effect, league);
        // Due at a fixed time, so the TV delay is not added once per queued effect.
        const dueAt = Date.now() + config.delaySeconds * 1000;
        queue = queue
          .then(async () => {
            await sleep(Math.max(0, dueAt - Date.now()));
            if (Date.now() - dueAt > MAX_LAG_SECONDS * 1000) {
              log(`Skipped a late effect: ${describe(event)}`);
              return;
            }
            await play(lights, config, effect, colors);
          })
          .catch((err: unknown) => console.error("Effect failed:", err));
      }
    },
    idle: () => queue,
  };
}

export interface RunOptions {
  /** Supplies the polled scoreboard; exists so tests can replay one. */
  fetchBoard?: (league: string) => Promise<GameSnapshot[]>;
  /** Signing secret for the webhook receiver. */
  webhookSecret?: string;
  /** Called once the webhook receiver is listening. */
  onListening?: (url: string) => void;
}

/**
 * Runs every enabled source until aborted. The poller and the webhook
 * receiver feed one tracker, so an event reported by both fires once.
 */
export async function run(
  config: Config,
  lights: Lights | undefined,
  signal: AbortSignal,
  options: RunOptions = {},
): Promise<void> {
  const league = resolveLeague(config.league);
  const tracker = new Tracker();
  const dispatcher = createDispatcher(config, lights, league);
  const who = config.teams.length ? config.teams.join(", ") : "every team";
  log(`Watching ${who} in ${league}${lights ? ` on "${lights.group.name}"` : " (dry run)"}`);

  const webhook = config.webhook;
  let server: ReturnType<typeof serveWebhook> | undefined;
  if (webhook) {
    if (!options.webhookSecret) throw new Error("The webhook receiver needs a signing secret: set WEBHOOK_SECRET in .env.");
    server = serveWebhook(tracker, {
      league,
      host: webhook.host,
      port: webhook.port,
      path: webhook.path,
      secret: options.webhookSecret,
      adapter: ADAPTERS[webhook.adapter]!,
      onEvents: dispatcher.handle,
    });
    log(`Webhook receiver (${webhook.adapter}) listening on ${server.url}`);
    options.onListening?.(server.url);
  }

  try {
    if (config.poll) {
      await runPoller(tracker, {
        league,
        liveSeconds: config.pollSeconds,
        signal,
        onEvents: dispatcher.handle,
        log,
        fetchBoard: options.fetchBoard,
      });
    } else if (!signal.aborted) {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    }
  } finally {
    await server?.stop();
  }
  await dispatcher.idle();
}
