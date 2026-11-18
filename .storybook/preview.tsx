import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../web/src/brand.css";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { Preview } from "@storybook/react-vite";
import { DEFAULT_ROUTES, fakeFetch, type FakeRoutes } from "../web/src/stories/fakeApi.ts";
import { cssVariablesResolver, theme } from "../web/src/theme.ts";

const preview: Preview = {
  globalTypes: {
    scheme: {
      description: "Light or dark",
      toolbar: {
        title: "Scheme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { scheme: "light" },
  parameters: {
    layout: "padded",
    controls: { matchers: { color: /(background|color)$/i } },
    a11y: { test: "todo" },
  },
  // Every story talks to a fake /api; `parameters.api` overrides single routes.
  beforeEach: ({ parameters }) => {
    const real = window.fetch;
    window.fetch = fakeFetch({ ...DEFAULT_ROUTES, ...((parameters.api as FakeRoutes | undefined) ?? {}) });
    return () => {
      window.fetch = real;
    };
  },
  decorators: [
    (Story, { globals }) => (
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme={globals.scheme === "dark" ? "dark" : "light"}>
        <Notifications position="top-center" />
        <Story />
      </MantineProvider>
    ),
  ],
};

export default preview;
