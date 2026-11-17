import { describe, expect, it } from "bun:test";
import { hexToXy, lampColors, WHITE } from "../src/color.ts";
import { effectFor, parseConfig } from "../src/config.ts";

describe("color", () => {
  it("converts sRGB primaries to their xy chromaticities", () => {
    const close = (hex: string, x: number, y: number) => {
      expect(hexToXy(hex).x).toBeCloseTo(x, 2);
      expect(hexToXy(hex).y).toBeCloseTo(y, 2);
    };
    close("#ff0000", 0.64, 0.33);
    close("00ff00", 0.3, 0.6);
    close("0000ff", 0.15, 0.06);
    expect(hexToXy("ffffff").x).toBeCloseTo(0.3127, 3);
  });
  it("rejects bad input", () => {
    expect(() => hexToXy("red")).toThrow(/Invalid colour/);
  });
  it("drops black and duplicate team colours", () => {
    expect(lampColors("000000", "ff0000")).toEqual([hexToXy("ff0000")]);
    expect(lampColors("ff0000", "ff0000")).toHaveLength(1);
    expect(lampColors("003c7f", "c9243f")).toHaveLength(2);
    expect(lampColors("000000", undefined)).toEqual([WHITE]);
  });
});

describe("config", () => {
  const base = { league: "nfl", group: "Living Room" };
  it("applies defaults", () => {
    const c = parseConfig(base);
    expect(c).toMatchObject({ teams: [], pollSeconds: 10, delaySeconds: 0, effectMode: "signal" });
    expect(effectFor(c, ["any.touchdown", "any.score"])).toMatchObject({ seconds: 6 });
    expect(effectFor(c, ["any.extra_point", "any.score"])).toBeUndefined();
    expect(effectFor(c, ["any.game_start"])).toBeUndefined();
    expect(effectFor(c, ["us.touchdown", "us.score"])).toMatchObject({ seconds: 10, signal: "alternating" });
  });
  it("falls back to the side's generic effect", () => {
    expect(effectFor(parseConfig(base), ["them.touchdown", "them.score"])).toMatchObject({ seconds: 3 });
  });
  it("lets a specific disabled effect win over the fallback", () => {
    expect(effectFor(parseConfig(base), ["us.basket", "us.score"])).toBeUndefined();
  });
  it("merges overrides", () => {
    const c = parseConfig({ ...base, effects: { loss: { seconds: 4 }, "us.goal": { enabled: false } } });
    expect(effectFor(c, ["loss"])).toMatchObject({ enabled: true, seconds: 4 });
    expect(effectFor(c, ["us.goal", "us.score"])).toBeUndefined();
  });
  it("rejects invalid values", () => {
    expect(() => parseConfig({ ...base, teams: "NYG" })).toThrow(/teams/);
    expect(() => parseConfig({ ...base, teams: ["NYG", ""] })).toThrow(/teams/);
    expect(() => parseConfig({ ...base, group: "" })).toThrow(/group/);
    expect(() => parseConfig({ ...base, pollSeconds: 1 })).toThrow(/pollSeconds/);
    expect(() => parseConfig({ ...base, effectMode: "disco" })).toThrow(/effectMode/);
  });
});
