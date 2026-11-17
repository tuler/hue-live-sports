/**
 * Turning an event into light: which colours, and how to play them. Shared by
 * the local runner and the Worker, so it uses no Bun or Node calls.
 */
import { lampColors, toLamp, type XY } from "./color.ts";
import type { Effect } from "./config.ts";
import type { TeamSide } from "./espn.ts";
import type { HueBridge, LightGroup } from "./hue.ts";
import { findNflTeam, NFL_LEAGUE } from "./nfl.ts";

export interface Lights {
  bridge: HueBridge;
  group: LightGroup;
}

export type EffectMode = "signal" | "pulse";

/**
 * An effect that would start this late is dropped: with many games live the
 * lights can fall behind, and a flash for a minute-old play means nothing.
 */
export const MAX_LAG_SECONDS = 45;

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

export async function play(lights: Lights, mode: EffectMode, effect: Effect, colors: XY[]): Promise<void> {
  if (mode === "pulse") await lights.bridge.pulse(lights.group, effect.seconds, colors);
  else await lights.bridge.signal(lights.group, effect.signal, effect.seconds, colors);
}
