import { createTheme } from "@mantine/core";

/** Shared by the app and Storybook. */
export const theme = createTheme({
  primaryColor: "orange",
  defaultRadius: "md",
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: { fontWeight: "700" },
});
