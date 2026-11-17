import { setTimeout as sleep } from "node:timers/promises";
import { lampColors, toLamp } from "./color.ts";
import { effectFor, type Config, type Effect } from "./config.ts";
import { fetchScoreboard, findGame, isTeam, resolveLeague, type GameSnapshot, type TeamSide } from "./espn.ts";
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

/** Colours for an event: the effect's override, else the relevant team's own. */
export function colorsFor(event: SportsEvent, effect: Effect, team: string, league: string): XY[] {
  if (effect.colors?.length) return toLamp(effect.colors);
  const side =
    event.type === "score" ? event.team : event.game.teams.find((t) => isTeam(t, team));
  return teamColors(league, side);
}

export async function play(lights: Lights, config: Config, effect: Effect, colors: XY[]): Promise<void> {
  if (config.effectMode === "pulse") await lights.bridge.pulse(lights.group, effect.seconds, colors);
  else await lights.bridge.signal(lights.group, effect.signal, effect.seconds, colors);
}

/** Seconds until the next poll: fast while live, slow when there is nothing to watch. */
export function nextPollSeconds(game: GameSnapshot | undefined, config: Config): number {
  if (game?.state === "in") return config.pollSeconds;
  if (game?.state === "pre") return 60;
  return 300;
}

/** Polls the scoreboard until aborted. Without `lights` it only logs (dry run). */
export async function run(config: Config, lights: Lights | undefined, signal: AbortSignal): Promise<void> {
  const league = resolveLeague(config.league);
  let prev: GameSnapshot | undefined;
  // Effects run one at a time so a touchdown and its extra point don't collide.
  let queue: Promise<void> = Promise.resolve();

  log(`Watching ${config.team} in ${league}${lights ? ` on "${lights.group.name}"` : " (dry run)"}`);

  while (!signal.aborted) {
    let game: GameSnapshot | undefined;
    try {
      game = findGame(await fetchScoreboard(league), config.team);
      if (game && game.id !== prev?.id) log(`Tracking ${game.name}: ${game.detail}`);
      if (!game && prev) log(`${config.team} is no longer on the scoreboard`);

      for (const event of game ? detectEvents(prev, game, config.team) : []) {
        log(describe(event));
        const effect = effectFor(config, eventKeys(event));
        if (!effect || !lights) continue;
        const colors = colorsFor(event, effect, config.team, league);
        queue = queue
          .then(() => sleep(config.delaySeconds * 1000))
          .then(() => play(lights, config, effect, colors))
          .catch((err: unknown) => console.error("Effect failed:", err));
      }
      prev = game;
    } catch (err) {
      // Keep the last baseline so a blip in the feed doesn't lose an event.
      console.error("Poll failed:", err instanceof Error ? err.message : err);
    }
    await sleep(nextPollSeconds(game ?? prev, config) * 1000, undefined, { signal }).catch(() => undefined);
  }
  await queue;
}
