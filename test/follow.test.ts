import { describe, expect, it } from "bun:test";
import { parseScoreboard } from "../src/espn.ts";
import { detectEvents } from "../src/events.ts";
import { endsGame, followable, followGame, FOLLOW_MS, forGame, hasLapsed, UPCOMING_MS } from "../src/follow.ts";
import { board, scoreboard, type FakeGame } from "./fixture.ts";

const snap = (state: "pre" | "in" | "post", home: number, away: number) =>
  parseScoreboard(scoreboard(state, home, away), "football/nfl")[0]!;

describe("followable", () => {
  const now = Date.UTC(2026, 10, 22, 12);
  const game = (id: string, state: FakeGame["state"], hoursAway?: number): FakeGame => ({
    id, state, home: [`H${id}`, 0], away: [`A${id}`, 0],
    ...(hoursAway === undefined ? {} : { startsAt: now + hoursAway * 3600_000 }),
  });
  const ids = (games: FakeGame[]) => followable(parseScoreboard(board(games), "soccer/eng.1"), now).map((g) => g.id);

  it("offers live games first, then games starting within a day, soonest first", () => {
    expect(ids([game("late", "pre", 20), game("live", "in", -1), game("soon", "pre", 1), game("done", "post", -3)])).toEqual([
      "live", "soon", "late",
    ]);
  });

  it("leaves out finals and games more than a day off, but keeps a game with no start time", () => {
    expect(ids([game("final", "post", -3), game("far", "pre", 25), game("tbd", "pre")])).toEqual(["tbd"]);
    expect(UPCOMING_MS).toBe(24 * 3600_000);
  });
});

describe("followGame", () => {
  it("keys the game by its teams and lapses twelve hours after the start", () => {
    const at = Date.UTC(2026, 10, 22, 18);
    const [g] = parseScoreboard(board([{ id: "1", state: "pre", home: ["NYG", 0], away: ["DAL", 0], startsAt: at }]), "football/nfl");
    const followed = followGame("nfl", g!, at - 3600_000);
    expect(followed).toMatchObject({
      league: "nfl",
      key: "dal-nyg",
      name: "DAL @ NYG",
      home: { abbreviation: "NYG", name: "Team NYG", color: "003c7f" },
      away: { abbreviation: "DAL" },
      startsAt: at,
      until: at + FOLLOW_MS,
    });
    expect(hasLapsed(followed, at + FOLLOW_MS - 1)).toBe(false);
    expect(hasLapsed(followed, at + FOLLOW_MS)).toBe(true);
  });

  it("counts from when it was picked if the start is unknown", () => {
    expect(followGame("nfl", snap("in", 7, 0), 5_000).until).toBe(5_000 + FOLLOW_MS);
  });
});

describe("forGame", () => {
  const td = detectEvents(snap("in", 0, 0), snap("in", 6, 0))[0]!; // NYG scores
  const kickoff = detectEvents(snap("pre", 0, 0), snap("in", 0, 0))[0]!;
  const win = detectEvents(snap("in", 14, 21), snap("post", 14, 21))[0]!; // DAL wins
  const draw = detectEvents(snap("in", 20, 20), snap("post", 20, 20))[0]!;

  it("gives the followed game's events, in the scorer's or winner's colours", () => {
    expect(forGame(td, "dal-nyg")).toEqual({ team: td.game.teams[0]!, keys: ["touchdown", "score"] });
    expect(forGame(win, "dal-nyg")?.team?.abbreviation).toBe("DAL");
  });

  it("names no team for a kickoff or a draw", () => {
    expect(forGame(kickoff, "dal-nyg")).toEqual({ keys: ["game_start"] });
    expect(forGame(draw, "dal-nyg")).toEqual({ keys: ["draw"] });
  });

  it("leaves out other games", () => {
    expect(forGame(td, "kc-nyg")).toBeUndefined();
  });

  it("spots the followed game's final", () => {
    expect(endsGame([td, win], "dal-nyg")).toBe(true);
    expect(endsGame([td], "dal-nyg")).toBe(false);
    expect(endsGame([win], "buf-kc")).toBe(false);
  });
});
