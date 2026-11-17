import { setTimeout as sleep } from "node:timers/promises";
import { lampColors, toLamp } from "./color.ts";
import { effectFor, type Config, type Effect } from "./config.ts";
import { fetchScoreboard, followedGames, resolveLeague, type GameSnapshot, type TeamSide } from "./espn.ts";
import { describe, detectEvents, eventKeys, type SportsEvent } from "./events.ts";
import type { HueBridge, LightGroup } from "./hue.ts";
import type { XY } from "./color.ts";
import { findNflTeam, NFL_LEAGUE } from "./nfl.ts";

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

/** Colours for an event: the effect's override, else those of the event's team. */
export function colorsFor(event: SportsEvent, effect: Effect, league: string): XY[] {
  return effect.colors?.length ? toLamp(effect.colors) : teamColors(league, event.team);
}

export async function play(lights: Lights, config: Config, effect: Effect, colors: XY[]): Promise<void> {
  if (config.effectMode === "pulse") await lights.bridge.pulse(lights.group, effect.seconds, colors);
  else await lights.bridge.signal(lights.group, effect.signal, effect.seconds, colors);
}

/** Seconds until the next poll: fast while any game is live, slow otherwise. */
export function nextPollSeconds(games: Iterable<GameSnapshot>, config: Config): number {
  const states = new Set([...games].map((g) => g.state));
  if (states.has("in")) return config.pollSeconds;
  if (states.has("pre")) return 60;
  return 300;
}

/**
 * An effect that would start this late is dropped: with many games live the
 * lights can fall behind, and a flash for a minute-old play means nothing.
 */
export const MAX_LAG_SECONDS = 45;

/**
 * Compare a fresh scoreboard with the previous poll and report every event in
 * the followed games. Returns the new baseline to pass to the next call.
 */
export function diffScoreboard(
  previous: ReadonlyMap<string, GameSnapshot>,
  scoreboard: GameSnapshot[],
  teams: readonly string[],
): { events: SportsEvent[]; games: Map<string, GameSnapshot> } {
  const games = new Map(followedGames(scoreboard, teams).map((g) => [g.id, g]));
  const events = [...games.values()].flatMap((g) => detectEvents(previous.get(g.id), g, teams));
  return { events, games };
}

/**
 * Polls the scoreboard until aborted. Without `lights` it only logs (dry run).
 * `source` supplies the scoreboard and exists so tests can replay one.
 */
export async function run(
  config: Config,
  lights: Lights | undefined,
  signal: AbortSignal,
  source: (league: string) => Promise<GameSnapshot[]> = fetchScoreboard,
): Promise<void> {
  const league = resolveLeague(config.league);
  const who = config.teams.length ? config.teams.join(", ") : "every game";
  let games = new Map<string, GameSnapshot>();
  // Effects run one at a time so a touchdown and its extra point don't collide.
  let queue: Promise<void> = Promise.resolve();

  log(`Watching ${who} in ${league}${lights ? ` on "${lights.group.name}"` : " (dry run)"}`);

  while (!signal.aborted) {
    try {
      const next = diffScoreboard(games, await source(league), config.teams);
      for (const game of next.games.values()) {
        const before = games.get(game.id);
        if (game.state === "in" && before?.state !== "in") log(`Live: ${game.name} (${game.detail})`);
      }
      if (games.size === 0) {
        const live = [...next.games.values()].filter((g) => g.state === "in").length;
        log(`${next.games.size} game(s) on the board, ${live} live`);
      }

      for (const event of next.events) {
        log(describe(event));
        const effect = effectFor(config, eventKeys(event));
        if (!effect || !lights) continue;
        const colors = colorsFor(event, effect, league);
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
      games = next.games;
    } catch (err) {
      // Keep the last baseline so a blip in the feed doesn't lose an event.
      console.error("Poll failed:", err instanceof Error ? err.message : err);
    }
    await sleep(nextPollSeconds(games.values(), config) * 1000, undefined, { signal }).catch(() => undefined);
  }
  await queue;
}
