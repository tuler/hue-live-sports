import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColorSchemeMenu } from "./ColorSchemeMenu.tsx";

/** In the header. Storybook forces the scheme from its toolbar, so picking here only moves the tick. */
const meta = {
  title: "Components/ColorSchemeMenu",
  component: ColorSchemeMenu,
} satisfies Meta<typeof ColorSchemeMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
