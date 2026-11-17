import { describe, expect, it } from "bun:test";
import { fetchScoreboard, followedGames, parseScoreboard, resolveLeague, sportOf } from "../src/espn.ts";
import { board, scoreboard } from "./fixture.ts";

describe("espn", () => {
  it("sends its own User-Agent, since ESPN's CDN rejects Bun's default", async () => {
    let sent: Headers | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return Response.json(scoreboard("in", 14, 7));
    }) as unknown as typeof fetch;
    await fetchScoreboard("football/nfl", fake);
    expect(sent?.get("user-agent")).toMatch(/^hue-live-sports\//);
  });

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

  it("follows every game unless teams are named", () => {
    const games = parseScoreboard(
      board([
        { id: "1", state: "in", home: ["NYG", 0], away: ["DAL", 0] },
        { id: "2", state: "in", home: ["KC", 0], away: ["BUF", 0] },
        { id: "3", state: "pre", home: ["SF", 0], away: ["SEA", 0] },
      ]),
      "football/nfl",
    );
    const ids = (teams: string[]) => followedGames(games, teams).map((g) => g.id);
    expect(ids([])).toEqual(["1", "2", "3"]);
    expect(ids(["buf"])).toEqual(["2"]);
    expect(ids(["Team NYG", "SEA"])).toEqual(["1", "3"]);
    expect(ids(["PHI"])).toEqual([]);
  });
});
