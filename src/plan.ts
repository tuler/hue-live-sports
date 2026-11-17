/**
 * What one viewer's lights should do about a batch of events. Pure, so the
 * local dispatcher and the Worker's User Durable Object decide the same way.
 */
import type { XY } from "./color.ts";
import { effectFor, type Effect, type Settings } from "./config.ts";
import { colorsFor, MAX_LAG_SECONDS } from "./effects.ts";
import { resolveLeague } from "./espn.ts";
import { describe, forTeams, type SportsEvent } from "./events.ts";

export interface PlannedEffect {
  /** When to start, after the viewer's TV delay (ms since epoch). */
  dueAt: number;
  label: string;
  effect: Effect;
  colors: XY[];
}

/** The events this viewer tracks, as effects due `delaySeconds` from `now`. Disabled ones are left out. */
export function planEffects(events: SportsEvent[], settings: Settings, now: number): PlannedEffect[] {
  const league = resolveLeague(settings.league);
  // Due at a fixed time, so the TV delay is not added once per queued effect.
  const dueAt = now + settings.delaySeconds * 1000;
  return events.flatMap((event) => {
    const mine = forTeams(event, settings.teams);
    const effect = mine && effectFor(settings, mine.keys);
    if (!mine || !effect) return [];
    return [{ dueAt, label: describe(event), effect, colors: colorsFor(mine.team, effect, league) }];
  });
}

/** Whether an effect due at `dueAt` is now too late to be worth playing. */
export const isLate = (dueAt: number, now: number): boolean => now - dueAt > MAX_LAG_SECONDS * 1000;
