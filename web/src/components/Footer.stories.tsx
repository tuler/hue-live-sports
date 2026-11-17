import type { Meta, StoryObj } from "@storybook/react-vite";
import { Footer } from "./Footer.tsx";

const meta = {
  title: "Components/Footer",
  component: Footer,
} satisfies Meta<typeof Footer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Under every screen. */
export const Default: Story = {};

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
