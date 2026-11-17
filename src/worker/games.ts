/**
 * The shared game state for one league. Every score source, the ESPN feeder
 * included, posts to its webhook receiver; the tracker merges them so each
 * play fires once, and the events go to every subscribed user. Nothing here
 * depends on any user's choices: users filter events themselves.
 */
import { DurableObject } from "cloudflare:workers";
import type { SportsEvent } from "../events.ts";
import { createWebhookHandler, genericAdapter } from "../sources/webhook.ts";
import { Tracker, type TrackerState } from "../tracker.ts";
import type { Env } from "./env.ts";

export const WEBHOOK_PATH = "/webhook";

export class Games extends DurableObject<Env> {
  private tracker?: Tracker;

  private async load(): Promise<Tracker> {
    this.tracker ??= Tracker.restore(await this.ctx.storage.get<TrackerState>("tracker"));
    return this.tracker;
  }

  private async subscribers(): Promise<string[]> {
    return (await this.ctx.storage.get<string[]>("subscribers")) ?? [];
  }

  /** The webhook receiver. The request URL carries the league as `?league=`. */
  override async fetch(req: Request): Promise<Response> {
    const league = new URL(req.url).searchParams.get("league") ?? "";
    const tracker = await this.load();
    const events: SportsEvent[] = [];
    const handle = createWebhookHandler(tracker, {
      league,
      path: WEBHOOK_PATH,
      secret: this.env.WEBHOOK_SECRET,
      adapter: genericAdapter,
      onEvents: (e) => void events.push(...e),
    });
    const res = await handle(req);
    if (res.ok) await this.ctx.storage.put("tracker", tracker.save());
    if (events.length) await this.fanOut(events);
    return res;
  }

  /**
   * Hands events to every subscriber. Each user only queues them, so this is
   * quick; a user that fails is logged and does not hold up the rest.
   */
  private async fanOut(events: SportsEvent[]): Promise<void> {
    const users = await this.subscribers();
    const results = await Promise.allSettled(users.map((id) => this.env.USER.getByName(id).deliver(events)));
    results.forEach((r, i) => {
      if (r.status === "rejected") console.error(`Delivering to user ${users[i]} failed:`, r.reason);
    });
  }

  async subscribe(userId: string): Promise<void> {
    const users = await this.subscribers();
    if (!users.includes(userId)) await this.ctx.storage.put("subscribers", [...users, userId]);
  }

  async unsubscribe(userId: string): Promise<void> {
    const users = await this.subscribers();
    await this.ctx.storage.put("subscribers", users.filter((u) => u !== userId));
  }

  async status() {
    const tracker = await this.load();
    return {
      subscribers: await this.subscribers(),
      games: tracker.games().map((g) => ({
        name: g.name,
        state: g.state,
        detail: g.detail,
        score: g.teams.map((t) => `${t.abbreviation} ${t.score}`).join(" - "),
      })),
    };
  }
}
