import type { Meta, StoryObj } from "@storybook/react-vite";
import { App } from "./App.tsx";
import { failWith, ME_NEW } from "./stories/fakeApi.ts";

/** The whole page, deciding between the sign-in screen and the settings from `GET /api/me`. */
const meta = {
  title: "Screens/App",
  component: App,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

export const SignedOut: Story = { parameters: { api: { "GET /api/me": failWith(401, "not signed in") } } };

export const FirstVisitAfterSignIn: Story = { parameters: { api: { "GET /api/me": ME_NEW } } };

export const Loading: Story = { parameters: { api: { "GET /api/me": "pending" } } };

export const ServerError: Story = { parameters: { api: { "GET /api/me": failWith(500, "Worker threw an exception") } } };

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
