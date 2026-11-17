import { setTimeout as sleep } from "node:timers/promises";
import { lampColors } from "./color.js";
import { effectFor, type Config, type Effect } from "./config.js";
import { fetchScoreboard, findGame, isTeam, resolveLeague, type GameSnapshot } from "./espn.js";
import { describe, detectEvents, eventKeys, type SportsEvent } from "./events.js";
import type { HueBridge, LightGroup } from "./hue.js";
import type { XY } from "./color.js";

export interface Lights {
  bridge: HueBridge;
  group: LightGroup;
}

const log = (msg: string) => console.log(`${new Date().toLocaleTimeString()}  ${msg}`);

/** Colours for an event: the effect's override, else the relevant team's own. */
export function colorsFor(event: SportsEvent, effect: Effect, team: string): XY[] {
  if (effect.colors?.length) return lampColors(...effect.colors);
  const side =
    event.type === "score" ? event.team : event.game.teams.find((t) => isTeam(t, team));
  return lampColors(side?.color, side?.alternateColor);
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
        const colors = colorsFor(event, effect, config.team);
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
