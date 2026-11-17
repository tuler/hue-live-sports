import { describe, expect, it } from "bun:test";
import { effectFor, parseConfig } from "../src/config.ts";
import { parseScoreboard, type GameSnapshot } from "../src/espn.ts";
import { eventKeys } from "../src/events.ts";
import { nextPollSeconds } from "../src/sources/poll.ts";
import { IDLE_GAME_MS, STALE_SCORE_MS, Tracker } from "../src/tracker.ts";
import { board, type FakeGame } from "./fixture.ts";

const parse = (games: FakeGame[]) => parseScoreboard(board(games), "football/nfl");
const game = (home: number, away: number, state: FakeGame["state"] = "in", id = "x"): FakeGame => ({
  id, state, home: ["NYG", home], away: ["DAL", away],
});

/** A tracker on a clock the test moves by hand. */
function tracker(teams: string[] = []) {
  let now = 1_000_000;
  const t = new Tracker(teams, () => now);
  return {
    t,
    advance: (ms: number) => void (now += ms),
    feed: (source: string, games: FakeGame[], complete = source === "poll") =>
      t.update(parse(games), source, complete).map((e) => eventKeys(e)[0]),
  };
}

describe("Tracker with one source", () => {
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
    const { feed } = tracker(teams);
    expect(feed("poll", first)).toEqual([]);
    return feed("poll", second);
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

  it("turns default-on events into effects and skips default-off ones", () => {
    const config = parseConfig({ league: "nfl", group: "Den" });
    expect(keys([]).filter((k) => effectFor(config, [k!]))).toEqual(["any.touchdown", "any.field_goal"]);
  });

  it("drops a game its only source stops listing, and re-baselines it on return", () => {
    const { t, feed } = tracker();
    feed("poll", first);
    feed("poll", [first[1]!]);
    expect(t.games().map((g) => g.name)).toEqual(["BUF @ KC"]);
    expect(feed("poll", second)).toEqual(["any.field_goal"]);
  });

  it("accepts a correction from the source that reported the score", () => {
    const { feed } = tracker();
    feed("poll", [game(0, 0)]);
    expect(feed("poll", [game(6, 0)])).toEqual(["any.touchdown"]);
    expect(feed("poll", [game(0, 0)])).toEqual([]); // overturned on review
    expect(feed("poll", [game(6, 0)])).toEqual(["any.touchdown"]);
  });

  it("forgets a game nobody has reported on for half a day", () => {
    const { t, feed, advance } = tracker();
    feed("webhook", [game(7, 0, "post")]);
    advance(IDLE_GAME_MS + 1);
    feed("webhook", [{ id: "9", state: "in", home: ["KC", 0], away: ["BUF", 0] }]);
    expect(t.games().map((g) => g.name)).toEqual(["BUF @ KC"]);
  });
});

describe("Tracker with a webhook and a poller", () => {
  it("fires once when both report the same score, whichever is first", () => {
    const { feed } = tracker();
    feed("poll", [game(0, 0, "in", "espn-401")]);
    // The providers number the game differently; it is matched by its teams.
    expect(feed("webhook", [game(6, 0, "in", "rt-77")])).toEqual(["any.touchdown"]);
    expect(feed("poll", [game(6, 0, "in", "espn-401")])).toEqual([]);
    expect(feed("poll", [game(6, 3, "in", "espn-401")])).toEqual(["any.field_goal"]);
    expect(feed("webhook", [game(6, 3, "in", "rt-77")])).toEqual([]);
  });

  it("ignores the slower source's stale score instead of re-firing", () => {
    const { feed } = tracker();
    feed("poll", [game(0, 0)]);
    expect(feed("webhook", [game(7, 0)])).toEqual(["any.touchdown"]);
    expect(feed("poll", [game(0, 0)])).toEqual([]); // the poll has not caught up
    expect(feed("poll", [game(7, 0)])).toEqual([]); // and now it has: no second flash
  });

  it("believes a lower score from the other source once it outlasts the stale window", () => {
    const { t, feed, advance } = tracker();
    feed("poll", [game(0, 0)]);
    feed("webhook", [game(6, 0)]);
    advance(STALE_SCORE_MS + 1);
    expect(feed("poll", [game(0, 0)])).toEqual([]);
    expect(t.games()[0]?.teams.map((x) => x.score)).toEqual([0, 0]);
    expect(feed("poll", [game(6, 0)])).toEqual(["any.touchdown"]);
  });

  it("never moves a game backwards, so the final fires once", () => {
    const { feed } = tracker(["NYG"]);
    feed("poll", [game(21, 14)]);
    expect(feed("webhook", [game(21, 14, "post")])).toEqual(["win"]);
    expect(feed("poll", [game(21, 14, "in")])).toEqual([]);
    expect(feed("poll", [game(21, 14, "post")])).toEqual([]);
  });

  it("keeps a webhook-fed game the poller's board never lists", () => {
    const { t, feed } = tracker();
    feed("webhook", [game(0, 0)]);
    feed("poll", []);
    expect(t.games()).toHaveLength(1);
    expect(feed("webhook", [game(3, 0)])).toEqual(["any.field_goal"]);
  });

  it("drops a webhook redelivered after a newer one", () => {
    const { t } = tracker();
    const at = (iso: string, home: number): GameSnapshot[] =>
      parse([game(home, 0)]).map((g) => ({ ...g, asOf: Date.parse(iso) }));
    t.update(at("2026-11-22T18:00:00Z", 0), "webhook");
    expect(t.update(at("2026-11-22T18:05:00Z", 7), "webhook")).toHaveLength(1);
    expect(t.update(at("2026-11-22T18:00:00Z", 0), "webhook")).toEqual([]);
    expect(t.update(at("2026-11-22T18:06:00Z", 7), "webhook")).toEqual([]);
  });
});

it("polls fast while anything is live", () => {
  const states = (...s: GameSnapshot["state"][]) => s.map((state) => ({ state }) as GameSnapshot);
  expect(nextPollSeconds(states("post", "in", "pre"), 7)).toBe(7);
  expect(nextPollSeconds(states("post", "pre"), 7)).toBe(60);
  expect(nextPollSeconds(states("post"), 7)).toBe(300);
  expect(nextPollSeconds([], 7)).toBe(300);
});
