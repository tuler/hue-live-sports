/**
 * The one game a viewer follows. They pick a live or upcoming game, only that
 * game's events play, and the choice lapses with its final. Games are known
 * by their two teams (`gameKey`), as everywhere else, never by a feed's id.
 */
import type { GameSnapshot, TeamSide } from "./espn.ts";
import { eventKeys, type SportsEvent } from "./events.ts";
import { gameKey } from "./tracker.ts";

/** How far ahead a game that has not started can be picked. */
export const UPCOMING_MS = 24 * 3600_000;
/**
 * Following lapses this long after the game starts (or is picked, if later),
 * in case its final is never seen: postponed, or dropped from the feed.
 */
export const FOLLOW_MS = 12 * 3600_000;

export type FollowedTeam = Pick<TeamSide, "abbreviation" | "name" | "color" | "alternateColor">;

export interface FollowedGame {
  /** As the viewer gave it: an alias ("nfl") or an ESPN path. */
  league: string;
  /** The game's `gameKey`. */
  key: string;
  name: string;
  home: FollowedTeam;
  away: FollowedTeam;
  /** Scheduled start, ms since epoch, if known. */
  startsAt?: number;
  /** When following lapses if no final arrives, ms since epoch. */
  until: number;
}

/** Games that can be followed at `now`: live ones, then those starting within `UPCOMING_MS`, soonest first. */
export function followable(games: GameSnapshot[], now: number): GameSnapshot[] {
  const soon = (g: GameSnapshot) => g.state === "pre" && (g.startsAt === undefined || g.startsAt <= now + UPCOMING_MS);
  const live = games.filter((g) => g.state === "in");
  const upcoming = games.filter(soon).sort((a, b) => (a.startsAt ?? Infinity) - (b.startsAt ?? Infinity));
  return [...live, ...upcoming];
}

const team = (t: TeamSide | undefined): FollowedTeam => ({
  abbreviation: t?.abbreviation ?? "",
  name: t?.name ?? t?.abbreviation ?? "",
  ...(t?.color ? { color: t.color } : {}),
  ...(t?.alternateColor ? { alternateColor: t.alternateColor } : {}),
});

/** The choice to follow `game`, made at `now`. */
export function followGame(league: string, game: GameSnapshot, now: number): FollowedGame {
  return {
    league,
    key: gameKey(game),
    name: game.name,
    home: team(game.teams.find((t) => t.homeAway === "home") ?? game.teams[0]),
    away: team(game.teams.find((t) => t.homeAway === "away") ?? game.teams[1]),
    ...(game.startsAt === undefined ? {} : { startsAt: game.startsAt }),
    until: Math.max(game.startsAt ?? now, now) + FOLLOW_MS,
  };
}

export const hasLapsed = (game: Pick<FollowedGame, "until">, now: number): boolean => now >= game.until;

/**
 * An event as seen by someone following the game `key`, or undefined if it is
 * another game's. `team` is whose colours to show: the scorer's or the
 * winner's. A kickoff or a draw has none, and shows both teams.
 */
export function forGame(event: SportsEvent, key: string): { team?: TeamSide; keys: string[] } | undefined {
  if (gameKey(event.game) !== key) return undefined;
  const team = event.type === "score" ? event.team : event.type === "game_end" ? event.winner : undefined;
  return { ...(team ? { team } : {}), keys: eventKeys(event) };
}

/** Whether `events` include the final of the game `key`. */
export const endsGame = (events: SportsEvent[], key: string): boolean =>
  events.some((e) => e.type === "game_end" && gameKey(e.game) === key);
