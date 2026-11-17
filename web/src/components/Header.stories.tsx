import type { Meta, StoryObj } from "@storybook/react-vite";
import { ME_SAVED } from "../stories/fakeApi.ts";
import { Header } from "./Header.tsx";

const meta = {
  title: "Components/Header",
  component: Header,
  args: { me: ME_SAVED },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Shows the bridge, and a menu to sign out or disconnect. */
export const SignedIn: Story = {};

export const SignedOut: Story = { args: { me: null } };

/** The bridge badge moves into the menu on narrow screens. */
export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
