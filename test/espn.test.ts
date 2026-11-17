import { describe, expect, it } from "vitest";
import { findGame, parseScoreboard, resolveLeague, sportOf } from "../src/espn.js";
import { scoreboard } from "./fixture.js";

describe("espn", () => {
  it("resolves aliases and raw paths", () => {
    expect(resolveLeague("NFL")).toBe("football/nfl");
    expect(resolveLeague("soccer/eng.1")).toBe("soccer/eng.1");
    expect(() => resolveLeague("../etc")).toThrow(/Unknown league/);
    expect(sportOf("soccer/eng.1")).toBe("soccer");
  });

  it("parses games and skips malformed entries", () => {
    const games = parseScoreboard(scoreboard("in", 14, 7), "football/nfl");
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ id: "401", state: "in", sport: "football", detail: "4:12 - 3rd" });
    expect(games[0]?.teams.map((t) => [t.abbreviation, t.score])).toEqual([["NYG", 14], ["DAL", 7]]);
  });

  it("returns nothing for junk input", () => {
    expect(parseScoreboard(null, "football/nfl")).toEqual([]);
    expect(parseScoreboard({ events: "nope" }, "football/nfl")).toEqual([]);
  });

  it("finds a team by abbreviation or name", () => {
    const games = parseScoreboard(scoreboard("in", 0, 0), "football/nfl");
    expect(findGame(games, "nyg")?.id).toBe("401");
    expect(findGame(games, "Dallas Cowboys")?.id).toBe("401");
    expect(findGame(games, "PHI")).toBeUndefined();
  });
});
