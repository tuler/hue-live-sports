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
    expect(detectEvents(undefined, snap("in", 21, 14), "NYG")).toEqual([]);
  });

  it("reports our touchdown", () => {
    const [e] = detectEvents(snap("in", 0, 0), snap("in", 6, 0), "NYG");
    expect(e).toMatchObject({ type: "score", side: "us", kind: "touchdown", points: 6 });
    expect(eventKeys(e!)).toEqual(["us.touchdown", "us.score"]);
  });

  it("reports the opponent's field goal", () => {
    const [e] = detectEvents(snap("in", 7, 0), snap("in", 7, 3), "NYG");
    expect(e).toMatchObject({ side: "them", kind: "field_goal" });
    expect(e?.type === "score" && e.team.abbreviation).toBe("DAL");
  });

  it("reports a soccer goal", () => {
    const [e] = detectEvents(snap("in", 0, 0, "soccer/eng.1"), snap("in", 1, 0, "soccer/eng.1"), "NYG");
    expect(e).toMatchObject({ kind: "goal", side: "us" });
  });

  it("ignores an overturned score and no change", () => {
    expect(detectEvents(snap("in", 6, 0), snap("in", 0, 0), "NYG")).toEqual([]);
    expect(detectEvents(snap("in", 6, 0), snap("in", 6, 0), "NYG")).toEqual([]);
  });

  it("reports kickoff and the final result", () => {
    expect(detectEvents(snap("pre", 0, 0), snap("in", 0, 0), "NYG")).toMatchObject([{ type: "game_start" }]);
    expect(detectEvents(snap("in", 21, 14), snap("post", 21, 14), "NYG")).toMatchObject([{ type: "game_end", result: "win" }]);
    expect(detectEvents(snap("in", 21, 14), snap("post", 21, 14), "DAL")).toMatchObject([{ result: "loss" }]);
    expect(detectEvents(snap("post", 21, 14), snap("post", 21, 14), "NYG")).toEqual([]);
  });

  it("reports a last-second score together with the final", () => {
    const events = detectEvents(snap("in", 21, 21), snap("post", 24, 21), "NYG");
    expect(events.map((e) => e.type)).toEqual(["score", "game_end"]);
  });
});
