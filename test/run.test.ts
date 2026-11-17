import { expect, it, spyOn } from "bun:test";
import { hexToXy } from "../src/color.ts";
import { parseConfig } from "../src/config.ts";
import { parseScoreboard } from "../src/espn.ts";
import type { FollowedGame } from "../src/follow.ts";
import type { HueBridge, LightGroup } from "../src/hue.ts";
import { run } from "../src/runner.ts";
import { board, following, type FakeGame } from "./fixture.ts";

/** Replays a list of scoreboards through the real loop with a recording bridge, following `game`. */
async function replay(polls: (FakeGame[] | Error)[], game: FollowedGame = following("NYG", "DAL")) {
  const config = { ...parseConfig({ league: "nfl", group: "Den" }), pollSeconds: 0.01 };
  const calls: { signal: string; seconds: number; colors: unknown[] }[] = [];
  const bridge = {
    signal: async (_g: LightGroup, signal: string, seconds: number, colors: unknown[]) => {
      calls.push({ signal, seconds, colors });
    },
  } as unknown as HueBridge;
  const group: LightGroup = { id: "gl", name: "Den", kind: "room", children: [] };
  const stop = new AbortController();
  let i = 0;
  const source = async () => {
    const poll = polls[i++];
    if (i >= polls.length) stop.abort();
    if (poll instanceof Error) throw poll;
    return parseScoreboard(board(poll ?? []), "football/nfl");
  };
  const logs = spyOn(console, "log").mockImplementation(() => {});
  const errors = spyOn(console, "error").mockImplementation(() => {});
  try {
    await run(config, game, { bridge, group }, stop.signal, { fetchBoard: source });
  } finally {
    logs.mockRestore();
    errors.mockRestore();
  }
  return { calls, polls: i };
}

const live = (id: string, home: [string, number], away: [string, number], state: FakeGame["state"] = "in"): FakeGame => ({
  id, state, home, away,
});

it("flashes for the followed game only, in the scoring team's colours", async () => {
  const { calls } = await replay([
    [live("1", ["NYG", 0], ["DAL", 0]), live("2", ["KC", 3], ["BUF", 0])],
    [live("1", ["NYG", 0], ["DAL", 6]), live("2", ["KC", 3], ["BUF", 0])],
    [live("1", ["NYG", 3], ["DAL", 7]), live("2", ["KC", 6], ["BUF", 0])],
  ]);
  expect(calls).toEqual([
    // DAL touchdown: blue and white, alternating.
    { signal: "alternating", seconds: 10, colors: [hexToXy("003594"), hexToXy("FFFFFF")] },
    // The extra point is off by default; NYG's field goal is blue and red. KC's game is not followed.
    { signal: "on_off_color", seconds: 5, colors: [hexToXy("0B2265"), hexToXy("A71930")] },
  ]);
});

it("keeps its baseline through a failed poll", async () => {
  const { calls } = await replay([
    [live("1", ["NYG", 0], ["DAL", 0])],
    new Error("feed down"),
    [live("1", ["NYG", 3], ["DAL", 0])],
  ]);
  expect(calls).toHaveLength(1);
});

it("stops after the followed game's final has played", async () => {
  const other = live("2", ["KC", 0], ["BUF", 0]);
  const { calls, polls } = await replay([
    [live("1", ["NYG", 0], ["DAL", 0], "pre"), other],
    [live("1", ["NYG", 0], ["DAL", 0]), other],
    [live("1", ["NYG", 7], ["DAL", 0], "post"), other],
    [live("1", ["NYG", 7], ["DAL", 0], "post"), { ...other, home: ["KC", 6] }],
    [live("1", ["NYG", 7], ["DAL", 0], "post"), other],
  ]);
  expect(polls).toBe(3);
  expect(calls).toEqual([
    // Kickoff alternates both teams' main colours.
    { signal: "alternating", seconds: 5, colors: [hexToXy("0B2265"), hexToXy("003594")] },
    { signal: "alternating", seconds: 10, colors: [hexToXy("0B2265"), hexToXy("A71930")] },
    // The win, in the winner's colours.
    { signal: "alternating", seconds: 10, colors: [hexToXy("0B2265"), hexToXy("A71930")] },
  ]);
});
