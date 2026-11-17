import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Settings } from "../api.ts";
import { SAVED } from "../stories/fakeApi.ts";
import { Advanced } from "./Advanced.tsx";

/** Holds the settings so the controls can be played with. */
function Stateful({ settings, sport }: { settings: Settings; sport: string }) {
  const [value, setValue] = useState(settings);
  return <Advanced settings={value} sport={sport} onChange={setValue} />;
}

const meta = {
  title: "Components/Advanced",
  component: Advanced,
  args: { settings: SAVED, sport: "football", onChange: () => {} },
  argTypes: { sport: { control: "select", options: ["football", "soccer", "hockey", "baseball", "basketball", "other"] } },
  render: (args) => <Stateful settings={args.settings} sport={args.sport} />,
} satisfies Meta<typeof Advanced>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Football lists touchdowns, field goals, two-point plays and extra points. */
export const Football: Story = {};

/** Soccer and hockey only have goals. */
export const Soccer: Story = { args: { sport: "soccer" } };

export const Basketball: Story = { args: { sport: "basketball" } };

export const ManualPulse: Story = { args: { settings: { ...SAVED, effectMode: "pulse" } } };

/** Turning an effect off hides its controls. */
export const EverythingOff: Story = {
  args: {
    settings: {
      ...SAVED,
      effects: Object.fromEntries(Object.entries(SAVED.effects).map(([k, fx]) => [k, { ...fx, enabled: false }])),
    },
  },
};

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
