/** Effect names and which ones belong to each sport. Keys match EFFECT_KEYS in src/events.ts. */

export const LABELS: Record<string, string> = {
  touchdown: "Touchdown",
  field_goal: "Field goal",
  two_points: "Two points",
  extra_point: "Extra point",
  goal: "Goal",
  run: "Run",
  basket: "Basket",
  score: "Any other score",
  game_start: "Kickoff",
  win: "Win",
  draw: "Draw",
};

const BY_SPORT: Record<string, string[]> = {
  football: ["touchdown", "field_goal", "two_points", "extra_point"],
  soccer: ["goal"],
  hockey: ["goal"],
  baseball: ["run"],
  basketball: ["basket"],
};

const ALWAYS = ["score", "game_start", "win", "draw"];

export const effectKeysFor = (sport: string): string[] => [...(BY_SPORT[sport] ?? []), ...ALWAYS];

/** The effect a "test flash" plays: the sport's main score if it is on, else anything on. */
export function testEffect(sport: string, effects: Record<string, { enabled: boolean }>): string | undefined {
  return effectKeysFor(sport).find((k) => effects[k]?.enabled);
}
