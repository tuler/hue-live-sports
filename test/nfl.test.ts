import { describe, expect, it } from "bun:test";
import { hexToXy } from "../src/color.ts";
import { parseConfig } from "../src/config.ts";
import { followedGames, parseScoreboard } from "../src/espn.ts";
import { findNflTeam, NFL_TEAMS, requireNflTeam } from "../src/nfl.ts";
import { teamColors } from "../src/effects.ts";
import { scoreboard } from "./fixture.ts";

describe("NFL teams", () => {
  it("has 32 teams, four in each of eight divisions", () => {
    expect(NFL_TEAMS).toHaveLength(32);
    const perDivision = Map.groupBy(NFL_TEAMS, (t) => t.division);
    expect(perDivision.size).toBe(8);
    for (const teams of perDivision.values()) expect(teams).toHaveLength(4);
  });

  it("has no clashing abbreviations, aliases or nicknames", () => {
    const names = NFL_TEAMS.flatMap((t) => [t.abbr, t.nickname, ...(t.aliases ?? [])].map((n) => n.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves every team by abbreviation, nickname and full name to itself", () => {
    for (const t of NFL_TEAMS) {
      expect(findNflTeam(t.abbr.toLowerCase())).toBe(t);
      expect(findNflTeam(t.nickname)).toBe(t);
      expect(findNflTeam(`${t.city} ${t.nickname}`)).toBe(t);
      for (const alias of t.aliases ?? []) expect(findNflTeam(alias)).toBe(t);
    }
  });

  it("gives every team valid, distinct lamp colours", () => {
    for (const t of NFL_TEAMS) {
      const colors = teamColors("football/nfl", { abbreviation: t.abbr });
      expect(colors).toHaveLength(t.colors.length);
      expect(colors[0]).toEqual(hexToXy(t.colors[0]));
    }
  });

  it("resolves a city only when one team plays there", () => {
    expect(findNflTeam("Dallas")?.abbr).toBe("DAL");
    expect(findNflTeam("New York")).toBeUndefined();
    expect(() => requireNflTeam("Los Angeles")).toThrow(/use LAC or LAR/);
    expect(() => requireNflTeam("Sharks")).toThrow(/not an NFL team.*ARI/);
  });

  it("keeps dark navy as blue instead of dropping it", () => {
    const [orange, navy] = teamColors("football/nfl", { abbreviation: "CHI" });
    expect(orange!.x).toBeGreaterThan(0.5);
    expect(navy!.x).toBeLessThan(0.25);
  });

  it("prefers the table over scoreboard colours, but only for the NFL", () => {
    const side = { abbreviation: "NYG", color: "00ff00", alternateColor: "000000" };
    expect(teamColors("football/nfl", side)[0]).toEqual(hexToXy("0B2265"));
    expect(teamColors("football/college-football", side)).toEqual([hexToXy("00ff00")]);
  });
});

describe("NFL config and scoreboard", () => {
  const base = { league: "nfl", group: "Den" };

  it("normalises configured teams to abbreviations", () => {
    expect(parseConfig({ ...base, teams: ["giants", "WAS", "San Francisco 49ers"] }).teams).toEqual(["NYG", "WSH", "SF"]);
    expect(parseConfig({ ...base, teams: ["Bucs", "TB", "tampa"] }).teams).toEqual(["TB"]);
    expect(parseConfig({ ...base, league: "football/nfl", team: "jets" }).teams).toEqual(["NYJ"]);
    expect(parseConfig(base).teams).toEqual([]);
  });

  it("rejects unknown NFL teams but leaves other leagues alone", () => {
    expect(() => parseConfig({ ...base, teams: ["NYG", "Arsenal"] })).toThrow(/not an NFL team/);
    expect(parseConfig({ ...base, league: "epl", teams: ["ARS"] }).teams).toEqual(["ARS"]);
  });

  it("matches a game when the feed uses another abbreviation", () => {
    const games = parseScoreboard(scoreboard("in", 7, 3, "WAS"), "football/nfl");
    expect(games[0]?.teams[1]?.abbreviation).toBe("WSH");
    expect(followedGames(games, parseConfig({ ...base, team: "Commanders" }).teams)[0]?.id).toBe("401");
  });
});
