import { setTimeout as sleep } from "node:timers/promises";
import type { Config } from "./config.ts";
import { play, type Lights } from "./effects.ts";
import { resolveLeague, type GameSnapshot } from "./espn.ts";
import { describe, type SportsEvent } from "./events.ts";
import { endsGame, forGame, type FollowedGame } from "./follow.ts";
import { isLate, planEffects } from "./plan.ts";
import { runPoller } from "./sources/poll.ts";
import { ADAPTERS, createWebhookHandler, type WebhookOptions } from "./sources/webhook.ts";
import { Tracker } from "./tracker.ts";

const log = (msg: string) => console.log(`${new Date().toLocaleTimeString()}  ${msg}`);

export interface Dispatcher {
  /** Log events and queue their effects. Returns at once. */
  handle(events: SportsEvent[]): void;
  /** Resolves when every queued effect has played. */
  idle(): Promise<void>;
}

/**
 * Turns the followed game's events into light effects, one at a time. Without
 * `lights` it only logs. `onFinal` is called once its final has been queued.
 */
export function createDispatcher(
  config: Config,
  game: FollowedGame,
  lights: Lights | undefined,
  onFinal: () => void = () => {},
): Dispatcher {
  // Effects run one at a time so a touchdown and its extra point don't collide.
  let queue: Promise<void> = Promise.resolve();
  return {
    handle(events) {
      const now = Date.now();
      for (const event of events) if (forGame(event, game.key)) log(describe(event));
      const final = endsGame(events, game.key);
      if (!lights) {
        if (final) onFinal();
        return;
      }
      for (const planned of planEffects(events, config, game, now)) {
        queue = queue
          .then(async () => {
            await sleep(Math.max(0, planned.dueAt - Date.now()));
            if (isLate(planned.dueAt, Date.now())) {
              log(`Skipped a late effect: ${planned.label}`);
              return;
            }
            await play(lights, config.effectMode, planned.effect, planned.colors);
          })
          .catch((err: unknown) => console.error("Effect failed:", err));
      }
      if (final) onFinal();
    },
    idle: () => queue,
  };
}

export type { Lights } from "./effects.ts";

interface WebhookServer {
  url: string;
  stop(): Promise<void>;
}

function serveWebhook(tracker: Tracker, options: WebhookOptions & { host: string; port: number }): WebhookServer {
  const server = Bun.serve({ hostname: options.host, port: options.port, fetch: createWebhookHandler(tracker, options) });
  return {
    url: `http://${server.hostname}:${server.port}${options.path}`,
    stop: () => server.stop(true),
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
 * Follows one game with every enabled source until its final has played, it
 * lapses, or `signal` aborts. The poller and the webhook receiver feed one
 * tracker, so an event reported by both fires once.
 */
export async function run(
  config: Config,
  game: FollowedGame,
  lights: Lights | undefined,
  signal: AbortSignal,
  options: RunOptions = {},
): Promise<void> {
  const league = resolveLeague(game.league);
  const tracker = new Tracker();
  const done = new AbortController();
  const stop = () => done.abort();
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  const lapse = setTimeout(() => {
    log(`No final seen for ${game.name}: stopping.`);
    stop();
    // setTimeout takes at most a 32-bit delay.
  }, Math.min(2 ** 31 - 1, Math.max(0, game.until - Date.now())));
  const dispatcher = createDispatcher(config, game, lights, () => {
    log(`${game.name} is over.`);
    stop();
  });
  log(`Following ${game.name} in ${league}${lights ? ` on "${lights.group.name}"` : " (dry run)"}`);

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
        signal: done.signal,
        onEvents: dispatcher.handle,
        log,
        fetchBoard: options.fetchBoard,
      });
    } else if (!done.signal.aborted) {
      await new Promise<void>((resolve) => done.signal.addEventListener("abort", () => resolve(), { once: true }));
    }
  } finally {
    clearTimeout(lapse);
    signal.removeEventListener("abort", stop);
    await server?.stop();
  }
  await dispatcher.idle();
}
