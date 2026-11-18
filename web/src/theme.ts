import { Card, type CSSVariablesResolver, createTheme, type MantineColorsTuple, Paper } from "@mantine/core";

/**
 * The brand's pink (`--sl-glow-mid`, #FF3D9A) at index 5, tinted towards white above it and
 * shaded towards the brand's ink below.
 */
const glow: MantineColorsTuple = [
  "#FFEFF7",
  "#FFDCED",
  "#FFBDDD",
  "#FF9ACA",
  "#FF6CB2",
  "#FF3D9A",
  "#DD3789",
  "#BD317A",
  "#9E2B6A",
  "#81265C",
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
  colors: { glow, dark },
  primaryColor: "glow",
  // Filled buttons are the bright brand pink with dark text (5.7:1), like the dark ball on the
  // logo's screen; white on that pink would be too faint.
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
 * `--sl-accent-text` is the brand pink dark or light enough to read as small text.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-body": "#F6F4EF",
    "--sl-surface": "#FFFFFF",
    "--sl-accent-text": glow[8],
  },
  dark: {
    "--sl-surface": dark[6],
    "--sl-accent-text": glow[4],
  },
});
