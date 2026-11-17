import { describe, expect, it } from "bun:test";
import { parseConfig, effectFor } from "../src/config.ts";
import { parseScoreboard, type GameSnapshot } from "../src/espn.ts";
import { classifyScore, detectEvents, eventKeys } from "../src/events.ts";
import { diffScoreboard, nextPollSeconds } from "../src/runner.ts";
import { board, scoreboard, type FakeGame } from "./fixture.ts";

const snap = (state: "pre" | "in" | "post", home: number, away: number, league = "football/nfl") =>
  parseScoreboard(scoreboard(state, home, away), league)[0]!;

describe("classifyScore", () => {
  it("names football scores by size", () => {
    expect([1, 2, 3, 6, 7, 8].map((d) => classifyScore("football", d))).toEqual([
      "extra_point", "two_points", "field_goal", "touchdown", "touchdown", "touchdown",
    ]);
  });
  it("names other sports", () => {
    expect(classifyScore("soccer", 1)).toBe("goal");
    expect(classifyScore("baseball", 2)).toBe("run");
    expect(classifyScore("basketball", 3)).toBe("basket");
  });
});

describe("detectEvents with no followed team", () => {
  it("stays quiet on the first poll", () => {
    expect(detectEvents(undefined, snap("in", 21, 14))).toEqual([]);
  });

  it("reports either team's score as 'any'", () => {
    const [home] = detectEvents(snap("in", 0, 0), snap("in", 6, 0));
    expect(home).toMatchObject({ type: "score", side: "any", kind: "touchdown", points: 6 });
    expect(eventKeys(home!)).toEqual(["any.touchdown", "any.score"]);
    const [away] = detectEvents(snap("in", 6, 0), snap("in", 6, 3));
    expect(away).toMatchObject({ side: "any", kind: "field_goal", team: { abbreviation: "DAL" } });
  });

  it("reports both teams scoring between two polls", () => {
    const events = detectEvents(snap("in", 0, 0), snap("in", 7, 3));
    expect(events.map((e) => e.type === "score" && [e.team.abbreviation, e.kind])).toEqual([
      ["NYG", "touchdown"], ["DAL", "field_goal"],
    ]);
  });

  it("ignores an overturned score and no change", () => {
    expect(detectEvents(snap("in", 6, 0), snap("in", 0, 0))).toEqual([]);
    expect(detectEvents(snap("in", 6, 0), snap("in", 6, 0))).toEqual([]);
  });

  it("marks kickoff and the final with the winner's colours", () => {
    const [start] = detectEvents(snap("pre", 0, 0), snap("in", 0, 0));
    expect(start).toMatchObject({ type: "game_start", side: "any" });
    expect(eventKeys(start!)).toEqual(["any.game_start"]);
    const [end] = detectEvents(snap("in", 14, 21), snap("post", 14, 21));
    expect(end).toMatchObject({ type: "game_end", result: "final", team: { abbreviation: "DAL" } });
    expect(eventKeys(end!)).toEqual(["any.final"]);
  });

  it("reports nothing for a tie or an already finished game", () => {
    expect(detectEvents(snap("in", 20, 20), snap("post", 20, 20))).toEqual([]);
    expect(detectEvents(snap("post", 21, 14), snap("post", 21, 14))).toEqual([]);
  });
});

describe("detectEvents with followed teams", () => {
  it("splits scores into us and them", () => {
    const [us] = detectEvents(snap("in", 0, 0), snap("in", 6, 0), ["NYG"]);
    expect(eventKeys(us!)).toEqual(["us.touchdown", "us.score"]);
    const [them] = detectEvents(snap("in", 7, 0), snap("in", 7, 3), ["NYG"]);
    expect(eventKeys(them!)).toEqual(["them.field_goal", "them.score"]);
  });

  it("reports a soccer goal", () => {
    const [e] = detectEvents(snap("in", 0, 0, "soccer/eng.1"), snap("in", 1, 0, "soccer/eng.1"), ["NYG"]);
    expect(e).toMatchObject({ kind: "goal", side: "us" });
  });

  it("reports kickoff and the result from the followed team's side", () => {
    expect(eventKeys(detectEvents(snap("pre", 0, 0), snap("in", 0, 0), ["DAL"])[0]!)).toEqual(["game_start"]);
    const end = (teams: string[], home = 21, away = 14) => detectEvents(snap("in", home, away), snap("post", home, away), teams)[0];
    expect(end(["NYG"])).toMatchObject({ result: "win", team: { abbreviation: "NYG" } });
    expect(end(["DAL"])).toMatchObject({ result: "loss", team: { abbreviation: "DAL" } });
    expect(end(["NYG"], 20, 20)).toMatchObject({ result: "draw" });
  });

  it("counts both teams as us when both are followed", () => {
    const events = detectEvents(snap("in", 0, 0), snap("in", 7, 3), ["NYG", "DAL"]);
    expect(events.map((e) => e.type === "score" && e.side)).toEqual(["us", "us"]);
    const [end] = detectEvents(snap("in", 14, 21), snap("post", 14, 21), ["NYG", "DAL"]);
    expect(end).toMatchObject({ result: "win", team: { abbreviation: "DAL" } });
  });

  it("reports a last-second score together with the final", () => {
    const events = detectEvents(snap("in", 21, 21), snap("post", 24, 21), ["NYG"]);
    expect(events.map((e) => e.type)).toEqual(["score", "game_end"]);
  });
});

describe("diffScoreboard", () => {
  const parse = (games: FakeGame[]) => parseScoreboard(board(games), "football/nfl");
  const first: FakeGame[] = [
    { id: "1", state: "in", home: ["NYG", 0], away: ["DAL", 0] },
    { id: "2", state: "in", home: ["KC", 10], away: ["BUF", 7] },
    { id: "3", state: "pre", home: ["SF", 0], away: ["SEA", 0] },
  ];
  const second: FakeGame[] = [
    { id: "1", state: "in", home: ["NYG", 6], away: ["DAL", 0] },
    { id: "2", state: "post", home: ["KC", 10], away: ["BUF", 10] },
    { id: "3", state: "in", home: ["SF", 0], away: ["SEA", 0] },
    { id: "4", state: "in", home: ["GB", 14], away: ["CHI", 3] },
  ];
  const keys = (teams: string[]) => {
    const baseline = diffScoreboard(new Map(), parse(first), teams);
    expect(baseline.events).toEqual([]);
    return diffScoreboard(baseline.games, parse(second), teams).events.map((e) => eventKeys(e)[0]);
  };

  it("follows every game by default", () => {
    // Game 2 ends tied after a BUF field goal; game 4 is new, so it only sets a baseline.
    expect(keys([])).toEqual(["any.touchdown", "any.field_goal", "any.game_start"]);
  });

  it("follows only the named teams' games", () => {
    expect(keys(["DAL"])).toEqual(["them.touchdown"]);
    expect(keys(["BUF", "SEA"])).toEqual(["us.field_goal", "draw", "game_start"]);
    expect(keys(["PHI"])).toEqual([]);
  });

  it("drops games that leave the board and re-baselines them if they return", () => {
    const a = diffScoreboard(new Map(), parse(first), []);
    const b = diffScoreboard(a.games, parse([first[1]!]), []);
    expect([...b.games.keys()]).toEqual(["2"]);
    expect(diffScoreboard(b.games, parse(second), []).events.map((e) => eventKeys(e)[0])).toEqual(["any.field_goal"]);
  });

  it("turns default-on events into effects and skips default-off ones", () => {
    const config = parseConfig({ league: "nfl", group: "Den" });
    const on = keys([]).filter((k) => effectFor(config, [k!]));
    expect(on).toEqual(["any.touchdown", "any.field_goal"]);
  });

  it("polls fast while anything is live", () => {
    const config = parseConfig({ league: "nfl", group: "Den", pollSeconds: 7 });
    const states = (...s: GameSnapshot["state"][]) => s.map((state) => ({ state }) as GameSnapshot);
    expect(nextPollSeconds(states("post", "in", "pre"), config)).toBe(7);
    expect(nextPollSeconds(states("post", "pre"), config)).toBe(60);
    expect(nextPollSeconds(states("post"), config)).toBe(300);
    expect(nextPollSeconds([], config)).toBe(300);
  });
});
