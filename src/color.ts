export interface XY {
  x: number;
  y: number;
}

/** D65 white point, used when a colour has no chromaticity (black). */
export const WHITE: XY = { x: 0.3127, y: 0.329 };

function parseHex(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return undefined;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** sRGB hex ("#0B2265" or "0B2265") to CIE 1931 xy, as the Hue API expects. */
export function hexToXy(hex: string): XY {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`Invalid colour "${hex}", expected 6 hex digits`);
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  }) as [number, number, number];
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const sum = X + Y + Z;
  if (sum === 0) return WHITE;
  return { x: round4(X / sum), y: round4(Y / sum) };
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** True when a colour is too dark to read as a colour on a lamp (e.g. black). */
export function isTooDark(hex: string): boolean {
  const rgb = parseHex(hex);
  return !rgb || Math.max(...rgb) < 0x50;
}

/**
 * Turn a team's primary/alternate colours into up to two lamp colours.
 * Many teams list black or near-black as a colour, which a lamp cannot show,
 * so dark entries are dropped and the other colour is used alone.
 */
export function lampColors(...hexes: (string | undefined)[]): XY[] {
  const usable = hexes.filter((h): h is string => !!h && !isTooDark(h)).map(hexToXy);
  const unique = usable.filter(
    (c, i) => usable.findIndex((o) => Math.abs(o.x - c.x) < 0.01 && Math.abs(o.y - c.y) < 0.01) === i,
  );
  return unique.length > 0 ? unique.slice(0, 2) : [WHITE];
}
