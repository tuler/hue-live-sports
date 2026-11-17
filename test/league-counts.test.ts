import { describe, expect, it } from "bun:test";
import { LEAGUES, parseScoreboard, type GameSnapshot } from "../src/espn.ts";
import { leagueCounter } from "../src/worker/league-counts.ts";
import { board } from "./fixture.ts";

const now = Date.UTC(2026, 10, 22, 12);
const liveGame = parseScoreboard(board([{ id: "1", state: "in", home: ["NYG", 3], away: ["DAL", 0] }]), "football/nfl");

describe("leagueCounter", () => {
  it("counts every league, and marks a league whose scoreboard failed as unknown", async () => {
    const load = async (path: string): Promise<GameSnapshot[]> => {
      if (path === LEAGUES.nfl) return liveGame;
      if (path === LEAGUES.mlb) throw new Error("ESPN scoreboard returned HTTP 502");
      return [];
    };
    const counts = await leagueCounter(load, () => now)();
    expect(Object.keys(counts).sort()).toEqual(Object.keys(LEAGUES).sort());
    expect(counts.nfl).toEqual({ live: 1, upcoming: 0 });
    expect(counts.nba).toEqual({ live: 0, upcoming: 0 });
    expect(counts.mlb).toBeNull();
  });

  it("reuses one answer, even one still in flight, until it is a minute old", async () => {
    let calls = 0;
    let clock = now;
    const counter = leagueCounter(
      async () => {
        calls++;
        return [];
      },
      () => clock,
    );
    const leagues = Object.keys(LEAGUES).length;
    await Promise.all([counter(), counter()]);
    expect(calls).toBe(leagues);
    clock += 59_000;
    await counter();
    expect(calls).toBe(leagues);
    clock += 1_000;
    await counter();
    expect(calls).toBe(2 * leagues);
  });
});
