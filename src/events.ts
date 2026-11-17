import { isAnyTeam, type GameSnapshot, type Sport, type TeamSide } from "./espn.ts";

export type ScoreKind =
  | "touchdown"
  | "field_goal"
  | "extra_point"
  | "two_points"
  | "goal"
  | "run"
  | "basket"
  | "score";

/**
 * Whose event it is. "us" and "them" only exist in a game involving a
 * followed team; in every other game the side is "any".
 */
export type Side = "us" | "them" | "any";

export type SportsEvent =
  | { type: "game_start"; side: "us" | "any"; team: TeamSide; game: GameSnapshot }
  | { type: "score"; side: Side; kind: ScoreKind; points: number; team: TeamSide; game: GameSnapshot }
  | {
      type: "game_end";
      /** "final" is a game with no followed team that ended with a winner. */
      result: "win" | "loss" | "draw" | "final";
      /** The team whose colours mark the result. */
      team: TeamSide;
      game: GameSnapshot;
    };

/**
 * Name a score change from the size of the jump alone.
 * In football, 2 points is either a conversion or a safety, and 7 or 8 means
 * a touchdown and its conversion both landed between two polls.
 */
export function classifyScore(sport: Sport, delta: number): ScoreKind {
  switch (sport) {
    case "football":
      if (delta >= 6) return "touchdown";
      if (delta === 3) return "field_goal";
      if (delta === 2) return "two_points";
      if (delta === 1) return "extra_point";
      return "score";
    case "soccer":
    case "hockey":
      return "goal";
    case "baseball":
      return "run";
    case "basketball":
      return "basket";
    default:
      return "score";
  }
}

/**
 * Compare two polls of the same game and report what happened in between.
 * `teams` are the followed teams; leave it empty to treat every team alike.
 *
 * The first poll (no `prev`) only sets the baseline, so starting the service
 * mid-game does not replay the existing score. Score decreases (an overturned
 * touchdown, a goal disallowed on review) are ignored and become the new
 * baseline.
 */
export function detectEvents(
  prev: GameSnapshot | undefined,
  next: GameSnapshot,
  teams: readonly string[] = [],
): SportsEvent[] {
  if (!prev || prev.id !== next.id) return [];
  const [home, away] = next.teams;
  if (!home || !away) return [];
  const events: SportsEvent[] = [];
  const ours = next.teams.filter((t) => isAnyTeam(t, teams));
  const sideOf = (t: TeamSide): Side => (ours.length === 0 ? "any" : ours.includes(t) ? "us" : "them");

  if (prev.state === "pre" && next.state === "in") {
    events.push({ type: "game_start", side: ours.length ? "us" : "any", team: ours[0] ?? home, game: next });
  }

  for (const side of next.teams) {
    const before = prev.teams.find((t) => t.id === side.id);
    if (!before) continue;
    const points = side.score - before.score;
    if (points > 0) {
      events.push({
        type: "score",
        side: sideOf(side),
        kind: classifyScore(next.sport, points),
        points,
        team: side,
        game: next,
      });
    }
  }

  if (prev.state !== "post" && next.state === "post") {
    const winner = home.score === away.score ? undefined : home.score > away.score ? home : away;
    if (ours.length === 0) {
      if (winner) events.push({ type: "game_end", result: "final", team: winner, game: next });
    } else if (!winner) {
      events.push({ type: "game_end", result: "draw", team: ours[0]!, game: next });
    } else if (ours.includes(winner)) {
      events.push({ type: "game_end", result: "win", team: winner, game: next });
    } else {
      events.push({ type: "game_end", result: "loss", team: ours[0]!, game: next });
    }
  }

  return events;
}

/** Config keys for an event, most specific first. */
export function eventKeys(event: SportsEvent): string[] {
  switch (event.type) {
    case "game_start":
      return [event.side === "any" ? "any.game_start" : "game_start"];
    case "game_end":
      return [event.result === "final" ? "any.final" : event.result];
    case "score":
      return [`${event.side}.${event.kind}`, `${event.side}.score`];
  }
}

export function describe(event: SportsEvent): string {
  const score = event.game.teams.map((t) => `${t.abbreviation} ${t.score}`).join(" - ");
  switch (event.type) {
    case "game_start":
      return `Game started: ${event.game.name}`;
    case "game_end":
      return `Final (${event.result === "final" ? `${event.team.abbreviation} win` : event.result}): ${score}`;
    case "score":
      return `${event.team.abbreviation} ${event.kind.replace("_", " ")} (+${event.points}): ${score} [${event.game.detail}]`;
  }
}
