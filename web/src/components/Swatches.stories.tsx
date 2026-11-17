import type { Meta, StoryObj } from "@storybook/react-vite";
import { Swatches } from "./Swatches.tsx";

const meta = {
  title: "Components/Swatches",
  component: Swatches,
  args: { colors: ["#0080C6", "#FFC20E"] },
} satisfies Meta<typeof Swatches>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoColours: Story = {};

/** A team ESPN lists with one colour. */
export const OneColour: Story = { args: { colors: ["#132257"] } };

/** Only the first two are shown. */
export const MoreThanTwo: Story = { args: { colors: ["#E31837", "#FFB81C", "#FFFFFF"] } };

/** A team with no colours on record renders nothing. */
export const NoColours: Story = { args: { colors: [] } };
