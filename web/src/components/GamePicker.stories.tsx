import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { FollowedGame } from "../api.ts";
import { failWith, FOLLOWING, ME_SAVED } from "../stories/fakeApi.ts";
import { GamePicker } from "./GamePicker.tsx";

/** Holds the league and the followed game, so picking and stopping can be played with. */
function Stateful({ followed: initial, league: start = "nfl" }: { followed?: FollowedGame; league?: string }) {
  const [league, setLeague] = useState(initial?.league ?? start);
  const [followed, setFollowed] = useState(initial);
  return (
    <GamePicker
      leagues={ME_SAVED.leagues}
      league={league}
      onLeague={setLeague}
      followed={followed}
      onFollow={(g) => setFollowed(g)}
      onStop={() => setFollowed(undefined)}
    />
  );
}

const meta = {
  title: "Components/GamePicker",
  component: GamePicker,
  args: { leagues: ME_SAVED.leagues, league: "nfl", onLeague: () => {}, onFollow: () => {}, onStop: () => {} },
  render: (args) => <Stateful followed={args.followed} league={args.league} />,
  decorators: [(Story) => <div style={{ maxWidth: 560 }}>{Story()}</div>],
} satisfies Meta<typeof GamePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing followed yet: the league's live games, then the ones starting soon. */
export const Picking: Story = {};

/** Following a live game: it sits on top with its live score, and is left out of the list. */
export const Following: Story = { args: { followed: FOLLOWING } };

/** Following an NFL game while browsing another league: the saved game still shows. */
export const FollowingAnotherLeague: Story = {
  args: { followed: FOLLOWING },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("radio", { name: /Premier League/ }));
    await expect(await canvas.findByText("Arsenal")).toBeInTheDocument();
    await expect(canvas.getByText("Following")).toBeInTheDocument();
  },
};

/** Picking a game puts it on top. */
export const PickAGame: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /San Francisco 49ers/ }));
    await expect(await canvas.findByText("Following")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  },
};

/** Leagues with nothing to follow are dimmed and can't be picked; a red dot marks leagues with a game live. */
export const EmptyLeaguesDimmed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("radio", { name: /MLB.*no games today/ })).toBeDisabled();
    await expect(canvas.getByRole("radio", { name: /Premier League.*live now/ })).toBeEnabled();
    // Ligue 1's scoreboard could not be read, so it is left alone.
    await expect(canvas.getByRole("radio", { name: "Ligue 1" })).toBeEnabled();
  },
};

/** Opened on a league with no games (say, remembered from last season): moves to one with a game live. */
export const OpensOnALeagueWithGames: Story = {
  args: { league: "mlb" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("radio", { name: /NFL/, checked: true })).toBeInTheDocument();
  },
};

/** Without counts (the request failed), every league can be picked as before. */
export const CountsUnavailable: Story = {
  parameters: { api: { "GET /api/leagues/counts": failWith(500, "boom") } },
};

export const NoGames: Story = { parameters: { api: { "GET /api/games": [] } } };

export const FailsToLoad: Story = { parameters: { api: { "GET /api/games": failWith(500, "ESPN scoreboard returned HTTP 502") } } };

export const StillLoading: Story = { parameters: { api: { "GET /api/games": "pending" } } };

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
