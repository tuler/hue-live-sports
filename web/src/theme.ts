import { Card, type CSSVariablesResolver, createTheme, type MantineColorsTuple, Paper } from "@mantine/core";

/**
 * The logo's orange (`--sl-glow-warm`, #FF9A3D) at index 5, tinted towards white above it and
 * darkened to a saturated burnt orange below (mixing in the ink would turn it brown).
 */
const brand: MantineColorsTuple = [
  "#FFF7EF",
  "#FFEDDC",
  "#FFDDBD",
  "#FFCA9A",
  "#FFB26C",
  "#FF9A3D",
  "#F97510",
  "#D65805",
  "#AE4104",
  "#8B3104",
];

/**
 * Mantine's dark-mode greys, rebuilt on the brand's night blue: the page is `--sl-ground`
 * (index 7), borders are the logo's bezel (index 4), dimmed text is the brand's muted text (index 2).
 */
const dark: MantineColorsTuple = [
  "#E6E8F0",
  "#C6CBDD",
  "#A8AEC6",
  "#6B7190",
  "#2E3558",
  "#252B4A",
  "#181D36",
  "#0C1022",
  "#090C1A",
  "#060812",
];

const FONT = 'Outfit, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Shared by the app and Storybook. Load `brand.css` alongside it for the font and the glow. */
export const theme = createTheme({
  colors: { brand, dark },
  primaryColor: "brand",
  // Filled buttons are the bright logo orange with dark text (8.9:1), like the dark ball on the
  // logo's screen; white on that orange would be far too faint (2.1:1).
  primaryShade: 5,
  autoContrast: true,
  luminanceThreshold: 0.25,
  black: "#0C1022",
  defaultRadius: "md",
  fontFamily: FONT,
  headings: { fontFamily: FONT, fontWeight: "700" },
  components: {
    // Cards are white on the light page's paper, a step above the night blue in dark.
    Paper: Paper.extend({ styles: { root: { backgroundColor: "var(--sl-surface)" } } }),
    Card: Card.extend({ styles: { root: { backgroundColor: "var(--sl-surface)" } } }),
  },
});

/**
 * Light pages sit on the brand's paper with white cards; dark pages on its night blue.
 * `--sl-accent-text` is the brand orange dark or light enough to read as small text, and to ring focus.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-body": "#F6F4EF",
    "--sl-surface": "#FFFFFF",
    "--sl-accent-text": brand[8],
  },
  dark: {
    "--sl-surface": dark[6],
    "--sl-accent-text": brand[4],
  },
});
