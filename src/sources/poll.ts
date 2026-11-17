import { setTimeout as sleep } from "node:timers/promises";
import { fetchScoreboard, type GameSnapshot } from "../espn.ts";
import type { SportsEvent } from "../events.ts";
import type { Tracker } from "../tracker.ts";

export const POLL_SOURCE = "poll";

export interface PollOptions {
  league: string;
  /** Interval while any followed game is live. */
  liveSeconds: number;
  signal: AbortSignal;
  onEvents: (events: SportsEvent[]) => void;
  log: (message: string) => void;
  /** Supplies the scoreboard; exists so tests can replay one. */
  fetchBoard?: (league: string) => Promise<GameSnapshot[]>;
}

/** Seconds until the next poll: fast while any game is live, slow otherwise. */
export function nextPollSeconds(games: Iterable<GameSnapshot>, liveSeconds: number): number {
  const states = new Set([...games].map((g) => g.state));
  if (states.has("in")) return liveSeconds;
  if (states.has("pre")) return 60;
  return 300;
}

/** Feeds the tracker from the scoreboard until aborted. */
export async function runPoller(tracker: Tracker, options: PollOptions): Promise<void> {
  const { league, signal, onEvents, log, fetchBoard = fetchScoreboard } = options;
  let first = true;
  while (!signal.aborted) {
    try {
      const wasLive = new Set(tracker.games().filter((g) => g.state === "in").map((g) => g.id));
      const events = tracker.update(await fetchBoard(league), POLL_SOURCE, true);
      const games = tracker.games();
      for (const g of games) {
        if (g.state === "in" && !wasLive.has(g.id)) log(`Live: ${g.name} (${g.detail})`);
      }
      if (first) log(`${games.length} game(s) on the board, ${games.filter((g) => g.state === "in").length} live`);
      first = false;
      onEvents(events);
    } catch (err) {
      // The tracker keeps its baseline, so a blip in the feed doesn't lose an event.
      console.error("Poll failed:", err instanceof Error ? err.message : err);
    }
    const wait = nextPollSeconds(tracker.games(), options.liveSeconds);
    await sleep(wait * 1000, undefined, { signal }).catch(() => undefined);
  }
}
