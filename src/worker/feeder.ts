/**
 * The ESPN feeder for one league: an alarm that polls the scoreboard and posts
 * it, signed, to the league's webhook receiver like any other score source.
 * Every 10 s while a game is live, every minute before kickoff, every five
 * minutes otherwise.
 */
import { DurableObject } from "cloudflare:workers";
import { fetchScoreboard } from "../espn.ts";
import { nextPollSeconds, scoreboardPayload } from "../sources/feed.ts";
import { signGeneric } from "../sources/webhook.ts";
import type { Env } from "./env.ts";
import { WEBHOOK_PATH } from "./games.ts";

const LIVE_SECONDS = 10;
const RETRY_SECONDS = 30;

interface FeederState {
  league: string;
  lastPollAt?: number;
  lastError?: string;
  lastReply?: string;
}

export class Feeder extends DurableObject<Env> {
  private async state(): Promise<FeederState | undefined> {
    return this.ctx.storage.get<FeederState>("state");
  }

  /** Starts polling `league` (an ESPN path), unless it already is. */
  async start(league: string): Promise<void> {
    const state = await this.state();
    if (!state) await this.ctx.storage.put<FeederState>("state", { league });
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now());
  }

  async stop(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
  }

  override async alarm(): Promise<void> {
    const state = await this.state();
    if (!state) return;
    let wait = RETRY_SECONDS;
    try {
      const games = await fetchScoreboard(state.league);
      const body = JSON.stringify(scoreboardPayload(games));
      const url = `https://games${WEBHOOK_PATH}?league=${encodeURIComponent(state.league)}`;
      const res = await this.env.GAMES.getByName(state.league).fetch(
        new Request(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...(await signGeneric(body, this.env.WEBHOOK_SECRET)) },
          body,
        }),
      );
      const reply = await res.text();
      if (!res.ok) throw new Error(`Receiver answered HTTP ${res.status} ${reply.slice(0, 200)}`);
      wait = nextPollSeconds(games, LIVE_SECONDS);
      await this.ctx.storage.put<FeederState>("state", { league: state.league, lastPollAt: Date.now(), lastReply: reply });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`ESPN feeder for ${state.league} failed:`, message);
      await this.ctx.storage.put<FeederState>("state", { ...state, lastError: message });
    }
    await this.ctx.storage.setAlarm(Date.now() + wait * 1000);
  }

  async status() {
    const alarm = await this.ctx.storage.getAlarm();
    return { ...(await this.state()), nextPollAt: alarm === null ? undefined : new Date(alarm).toISOString() };
  }
}
