import type { Meta, StoryObj } from "@storybook/react-vite";
import { ME_SAVED } from "../stories/fakeApi.ts";
import { LeagueLogo } from "./LeagueLogo.tsx";

/** Logos come from ESPN's CDN, so these stories need the network. Switch the toolbar's scheme to see the dark versions. */
const meta = {
  title: "Components/LeagueLogo",
  component: LeagueLogo,
  args: { logo: ME_SAVED.leagues[0]!.logo, size: 20 },
  argTypes: { size: { control: { type: "range", min: 16, max: 80, step: 2 } } },
} satisfies Meta<typeof LeagueLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In the league picker. */
export const Default: Story = {};

export const Large: Story = { args: { size: 64 } };

/** A league with no logo keeps the space, so names still line up. */
export const Missing: Story = { args: { logo: undefined } };
