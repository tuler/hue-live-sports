import { Button } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FOLLOWING, GAMES } from "../stories/fakeApi.ts";
import { GameCard } from "./GameCard.tsx";

const [kcLac, , sfGb] = GAMES.nfl!;

const meta = {
  title: "Components/GameCard",
  component: GameCard,
  args: { game: kcLac!, onSelect: () => {} },
  decorators: [(Story) => <div style={{ maxWidth: 560 }}>{Story()}</div>],
} satisfies Meta<typeof GameCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A live game shows the score and the clock. */
export const Live: Story = {};

/** Before kickoff: the start time instead of a score. */
export const Upcoming: Story = { args: { game: sfGb! } };

/** Just tapped: the hint spins while the follow is saved. */
export const Selecting: Story = { args: { selecting: true } };

/** Another game is being followed: the rest wait. */
export const Disabled: Story = { args: { disabled: true } };

/** The game the lights are following, with its live score. */
export const Following: Story = {
  args: { following: true, onSelect: undefined, action: <Button variant="default" size="compact-xs" my={-2}>Stop</Button> },
};

/** The followed game as saved, when the list has no live data for it: names and start time only. */
export const FollowingWithoutLiveData: Story = {
  args: { game: FOLLOWING, following: true, onSelect: undefined, action: <Button variant="default" size="compact-xs" my={-2}>Stop</Button> },
};

export const Soccer: Story = { args: { game: GAMES.epl![0]! } };

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
