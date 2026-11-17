import { describe, expect, it } from "bun:test";
import { parseScoreboard } from "../src/espn.ts";
import { classifyScore, detectEvents, eventKeys } from "../src/events.ts";
import { scoreboard } from "./fixture.ts";

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
