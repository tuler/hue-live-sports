import { Button } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FOLLOWING, GAMES } from "../stories/fakeApi.ts";
import { GameCard } from "./GameCard.tsx";

const [kcLac, , sfGb] = GAMES.nfl!;

const meta = {
  title: "Components/GameCard",
  component: GameCard,
  args: { game: kcLac!, action: <Button variant="light" size="xs">Follow</Button> },
  decorators: [(Story) => <div style={{ maxWidth: 560 }}>{Story()}</div>],
} satisfies Meta<typeof GameCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A live game shows the score and the clock. */
export const Live: Story = {};

/** Before kickoff: the start time instead of a score. */
export const Upcoming: Story = { args: { game: sfGb! } };

/** The game the lights are following, with its live score. */
export const Following: Story = {
  args: { following: true, action: <Button variant="default" size="xs">Stop</Button> },
};

/** The followed game as saved, when the list has no live data for it: names and start time only. */
export const FollowingWithoutLiveData: Story = {
  args: { game: FOLLOWING, following: true, action: <Button variant="default" size="xs">Stop</Button> },
};

export const Soccer: Story = { args: { game: GAMES.epl![0]! } };

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
