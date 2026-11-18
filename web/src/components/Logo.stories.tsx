import type { Meta, StoryObj } from "@storybook/react-vite";
import { Logo } from "./Logo.tsx";

const meta = {
  title: "Components/Logo",
  component: Logo,
  args: { variant: "horizontal", size: 36 },
  argTypes: {
    variant: { control: "inline-radio", options: ["horizontal", "stacked"] },
    size: { control: { type: "range", min: 16, max: 240, step: 2 } },
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In the header. */
export const Header: Story = {};

/** On the sign-in screen. */
export const Hero: Story = { args: { variant: "stacked", size: 150 } };
