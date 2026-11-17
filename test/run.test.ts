import { expect, it, spyOn } from "bun:test";
import { hexToXy } from "../src/color.ts";
import { parseConfig } from "../src/config.ts";
import { parseScoreboard } from "../src/espn.ts";
import type { HueBridge, LightGroup } from "../src/hue.ts";
import { run } from "../src/runner.ts";
import { board, type FakeGame } from "./fixture.ts";

/** Replays a list of scoreboards through the real loop with a recording bridge. */
async function replay(polls: (FakeGame[] | Error)[], overrides: object = {}) {
  const config = { ...parseConfig({ league: "nfl", group: "Den", ...overrides }), pollSeconds: 0.01 };
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
    await run(config, { bridge, group }, stop.signal, { fetchBoard: source });
  } finally {
    logs.mockRestore();
    errors.mockRestore();
  }
  return calls;
}

const live = (id: string, home: [string, number], away: [string, number]): FakeGame => ({ id, state: "in", home, away });

it("flashes for scores in every live game, in the scoring team's colours", async () => {
  const calls = await replay([
    [live("1", ["NYG", 0], ["DAL", 0]), live("2", ["KC", 3], ["BUF", 0])],
    [live("1", ["NYG", 0], ["DAL", 6]), live("2", ["KC", 3], ["BUF", 0])],
    [live("1", ["NYG", 0], ["DAL", 7]), live("2", ["KC", 6], ["BUF", 0])],
  ]);
  expect(calls).toEqual([
    // DAL touchdown: blue and white, alternating.
    { signal: "alternating", seconds: 10, colors: [hexToXy("003594"), hexToXy("FFFFFF")] },
    // The extra point is off by default; KC's field goal is red and gold.
    { signal: "on_off_color", seconds: 5, colors: [hexToXy("E31837"), hexToXy("FFB81C")] },
  ]);
});

it("keeps its baseline through a failed poll", async () => {
  const calls = await replay([
    [live("1", ["NYG", 0], ["DAL", 0])],
    new Error("feed down"),
    [live("1", ["NYG", 3], ["DAL", 0])],
  ]);
  expect(calls).toHaveLength(1);
});

it("only flashes for tracked teams when some are configured", async () => {
  const calls = await replay(
    [
      [live("1", ["NYG", 0], ["DAL", 0]), live("2", ["KC", 3], ["BUF", 0])],
      [live("1", ["NYG", 6], ["DAL", 0]), live("2", ["KC", 9], ["BUF", 0])],
    ],
    { teams: ["Giants"] },
  );
  expect(calls).toEqual([{ signal: "alternating", seconds: 10, colors: [hexToXy("0B2265"), hexToXy("A71930")] }]);
});
