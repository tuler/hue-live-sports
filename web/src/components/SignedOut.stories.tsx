import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignedOut } from "./SignedOut.tsx";

const meta = {
  title: "Screens/SignedOut",
  component: SignedOut,
} satisfies Meta<typeof SignedOut>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What a visitor sees before connecting a bridge. "Connect Hue" starts the Hue sign-in. */
export const Default: Story = {};

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
