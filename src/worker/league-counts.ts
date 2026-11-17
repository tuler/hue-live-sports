/**
 * How many games each league has open to follow, so the settings page can dim the empty ones.
 * Every league's scoreboard is fetched at once and the answer is kept for `COUNTS_TTL_MS` in this
 * isolate, with one shared request in flight, so a burst of visitors costs one round of ESPN calls.
 */
import { fetchScoreboard, LEAGUES, type GameSnapshot } from "../espn.ts";
import { countFollowable, type FollowableCount } from "../follow.ts";

/** Per league alias; `null` where the scoreboard could not be read, so the page leaves that league alone. */
export type LeagueCounts = Record<string, FollowableCount | null>;

export const COUNTS_TTL_MS = 60_000;

export function leagueCounter(
  load: (leaguePath: string) => Promise<GameSnapshot[]> = (path) => fetchScoreboard(path),
  now: () => number = Date.now,
  ttlMs = COUNTS_TTL_MS,
): () => Promise<LeagueCounts> {
  let cached: { at: number; counts: Promise<LeagueCounts> } | undefined;
  return () => {
    const at = now();
    if (!cached || at - cached.at >= ttlMs) {
      const counts = Promise.all(
        Object.entries(LEAGUES).map(async ([id, path]) => {
          try {
            return [id, countFollowable(await load(path), at)] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      ).then((entries) => Object.fromEntries(entries));
      cached = { at, counts };
    }
    return cached.counts;
  };
}
