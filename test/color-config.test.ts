import { describe, expect, it } from "bun:test";
import { hexToXy, lampColors, WHITE } from "../src/color.ts";
import { effectFor, parseConfig, parseSettings } from "../src/config.ts";

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
    expect(c).toMatchObject({ league: "nfl", pollSeconds: 10, delaySeconds: 0, effectMode: "signal" });
    expect(effectFor(c, ["touchdown", "score"])).toMatchObject({ seconds: 10, signal: "alternating" });
    expect(effectFor(c, ["extra_point", "score"])).toBeUndefined();
    expect(effectFor(c, ["game_start"])).toMatchObject({ seconds: 5, signal: "alternating" });
    expect(effectFor(c, ["win"])).toMatchObject({ seconds: 10, signal: "alternating" });
  });
  it("keeps settings to lasting choices: no league or game", () => {
    expect(Object.keys(parseSettings({ group: "Den", league: "nfl" })).sort()).toEqual(["delaySeconds", "effectMode", "effects", "group"]);
  });
  it("lets a specific disabled effect win over the fallback", () => {
    expect(effectFor(parseConfig(base), ["basket", "score"])).toBeUndefined();
  });
  it("merges overrides", () => {
    const c = parseConfig({ ...base, effects: { draw: { seconds: 4 }, goal: { enabled: false } } });
    expect(effectFor(c, ["draw"])).toMatchObject({ enabled: true, seconds: 4 });
    expect(effectFor(c, ["goal", "score"])).toBeUndefined();
  });
  it("rejects unknown effects, pointing old side-prefixed keys at their new name", () => {
    expect(() => parseConfig({ ...base, effects: { "any.touchdown": {} } })).toThrow(/use "touchdown"/);
    expect(() => parseConfig({ ...base, effects: { loss: {} } })).toThrow(/Unknown effect "loss"\. Known/);
  });
  it("rejects invalid values", () => {
    expect(() => parseConfig({ group: "Den" })).toThrow(/league/);
    expect(() => parseConfig({ ...base, league: "../etc" })).toThrow(/Unknown league/);
    expect(() => parseConfig({ ...base, group: "" })).toThrow(/group/);
    expect(() => parseConfig({ ...base, pollSeconds: 1 })).toThrow(/pollSeconds/);
    expect(() => parseConfig({ ...base, effectMode: "disco" })).toThrow(/effectMode/);
  });
});
