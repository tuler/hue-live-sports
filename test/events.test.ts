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

describe("detectEvents", () => {
  it("stays quiet on the first poll", () => {
    expect(detectEvents(undefined, snap("in", 21, 14))).toEqual([]);
  });

  it("reports each team's score by kind", () => {
    const [home] = detectEvents(snap("in", 0, 0), snap("in", 6, 0));
    expect(home).toMatchObject({ type: "score", kind: "touchdown", points: 6, team: { abbreviation: "NYG" } });
    expect(eventKeys(home!)).toEqual(["touchdown", "score"]);
    const [away] = detectEvents(snap("in", 6, 0), snap("in", 6, 3));
    expect(away).toMatchObject({ kind: "field_goal", team: { abbreviation: "DAL" } });
  });

  it("reports a soccer goal", () => {
    const [e] = detectEvents(snap("in", 0, 0, "soccer/eng.1"), snap("in", 1, 0, "soccer/eng.1"));
    expect(e).toMatchObject({ kind: "goal" });
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

  it("reports kickoff, a win and a draw", () => {
    const [start] = detectEvents(snap("pre", 0, 0), snap("in", 0, 0));
    expect(eventKeys(start!)).toEqual(["game_start"]);
    const [end] = detectEvents(snap("in", 14, 21), snap("post", 14, 21));
    expect(end).toMatchObject({ type: "game_end", winner: { abbreviation: "DAL" } });
    expect(eventKeys(end!)).toEqual(["win"]);
    const [draw] = detectEvents(snap("in", 20, 20), snap("post", 20, 20));
    expect(draw).toMatchObject({ type: "game_end", winner: undefined });
    expect(eventKeys(draw!)).toEqual(["draw"]);
    expect(detectEvents(snap("post", 21, 14), snap("post", 21, 14))).toEqual([]);
  });

  it("reports a last-second score together with the final", () => {
    const events = detectEvents(snap("in", 21, 21), snap("post", 24, 21));
    expect(events.map((e) => e.type)).toEqual(["score", "game_end"]);
  });
});
