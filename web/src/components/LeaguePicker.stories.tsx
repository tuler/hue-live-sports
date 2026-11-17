import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ME_SAVED } from "../stories/fakeApi.ts";
import { LeaguePicker } from "./LeaguePicker.tsx";

/** Logos come from ESPN's CDN, so these stories need the network. */
const meta = {
  title: "Components/LeaguePicker",
  component: LeaguePicker,
  args: { leagues: ME_SAVED.leagues, value: "nfl", label: "League", onChange: () => {} },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <LeaguePicker {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof LeaguePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Four across; long names wrap to two lines. */
export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
