import { isTeam, type GameSnapshot, type Sport, type TeamSide } from "./espn.ts";

export type ScoreKind =
  | "touchdown"
  | "field_goal"
  | "extra_point"
  | "two_points"
  | "goal"
  | "run"
  | "basket"
  | "score";

export type SportsEvent =
  | { type: "game_start"; game: GameSnapshot }
  | {
      type: "score";
      side: "us" | "them";
      kind: ScoreKind;
      points: number;
      team: TeamSide;
      game: GameSnapshot;
    }
  | { type: "game_end"; result: "win" | "loss" | "draw"; game: GameSnapshot };

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
 * The first poll (no `prev`) only sets the baseline, so starting the service
 * mid-game does not replay the existing score. Score decreases (an overturned
 * touchdown, a goal disallowed on review) are ignored and become the new
 * baseline.
 */
export function detectEvents(
  prev: GameSnapshot | undefined,
  next: GameSnapshot,
  team: string,
): SportsEvent[] {
  if (!prev || prev.id !== next.id) return [];
  const events: SportsEvent[] = [];

  if (prev.state === "pre" && next.state === "in") {
    events.push({ type: "game_start", game: next });
  }

  for (const side of next.teams) {
    const before = prev.teams.find((t) => t.id === side.id);
    if (!before) continue;
    const points = side.score - before.score;
    if (points > 0) {
      events.push({
        type: "score",
        side: isTeam(side, team) ? "us" : "them",
        kind: classifyScore(next.sport, points),
        points,
        team: side,
        game: next,
      });
    }
  }

  if (prev.state !== "post" && next.state === "post") {
    const us = next.teams.find((t) => isTeam(t, team));
    const them = next.teams.find((t) => !isTeam(t, team));
    if (us && them) {
      const result = us.score > them.score ? "win" : us.score < them.score ? "loss" : "draw";
      events.push({ type: "game_end", result, game: next });
    }
  }

  return events;
}

/** Config keys for an event, most specific first. */
export function eventKeys(event: SportsEvent): string[] {
  switch (event.type) {
    case "game_start":
      return ["game_start"];
    case "game_end":
      return [event.result];
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
      return `Final (${event.result}): ${score}`;
    case "score":
      return `${event.team.abbreviation} ${event.kind.replace("_", " ")} (+${event.points}): ${score} [${event.game.detail}]`;
  }
}
