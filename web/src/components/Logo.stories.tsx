import type { Meta, StoryObj } from "@storybook/react-vite";
import { Logo } from "./Logo.tsx";

const meta = {
  title: "Components/Logo",
  component: Logo,
  args: { size: 30 },
  argTypes: { size: { control: { type: "range", min: 16, max: 160, step: 2 } } },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In the header. */
export const Header: Story = {};

/** On the sign-in screen. */
export const Hero: Story = { args: { size: 72 } };
