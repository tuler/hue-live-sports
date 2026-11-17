import { setTimeout as sleep } from "node:timers/promises";
import type { Config } from "./config.ts";
import { play, type Lights } from "./effects.ts";
import { resolveLeague, type GameSnapshot } from "./espn.ts";
import { describe, forTeams, type SportsEvent } from "./events.ts";
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

/** Turns events into light effects, one at a time. Without `lights` it only logs. */
export function createDispatcher(config: Config, lights: Lights | undefined): Dispatcher {
  // Effects run one at a time so a touchdown and its extra point don't collide.
  let queue: Promise<void> = Promise.resolve();
  return {
    handle(events) {
      const now = Date.now();
      for (const event of events) if (forTeams(event, config.teams)) log(describe(event));
      if (!lights) return;
      for (const planned of planEffects(events, config, now)) {
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
  const dispatcher = createDispatcher(config, lights);
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
