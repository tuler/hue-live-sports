import { Select } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Section } from "./Section.tsx";

const meta = {
  title: "Components/Section",
  component: Section,
  args: {
    title: "Your lights",
    description: "The room or zone that flashes.",
    children: <Select data={["Living Room", "Kitchen"]} defaultValue="Living Room" aria-label="Room" />,
  },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDescription: Story = {};

export const WithoutDescription: Story = { args: { description: undefined } };
