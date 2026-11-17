import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { failWith, ME_NEW, ME_NOT_FOLLOWING, ME_SAVED } from "../stories/fakeApi.ts";
import { SettingsScreen } from "./SettingsScreen.tsx";

const meta = {
  title: "Screens/SettingsScreen",
  component: SettingsScreen,
  args: { me: ME_SAVED },
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>{Story()}</div>],
} satisfies Meta<typeof SettingsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A returning fan following a live NFL game, with a 20 s delay. Rooms and games load from the fake /api. */
export const Following: Story = {};

/** Settings saved, but no game picked: the last one ended. */
export const NotFollowing: Story = { args: { me: ME_NOT_FOLLOWING } };

/** Straight after the first sign-in: nothing saved yet. */
export const NewUser: Story = { args: { me: ME_NEW } };

/** Following a game saves the settings first, then shows the game on top. */
export const FollowAGame: Story = {
  args: { me: ME_NEW },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Follow Dallas Cowboys at New York Giants" }));
    await expect(await canvas.findByText("Following")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Saved" })).toBeDisabled();
  },
};

export const StopFollowing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Stop" }));
    await expect(await within(document.body).findByText(/Stopped following/)).toBeInTheDocument();
    await expect(canvas.queryByText("Following")).not.toBeInTheDocument();
  },
};

/** The game ended or lapsed between loading the list and pressing Follow. */
export const GameGoneWhenFollowing: Story = {
  args: { me: ME_NOT_FOLLOWING },
  parameters: { api: { "PUT /api/game": failWith(404, "That game is not live or coming up any more.") } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Follow Kansas City Chiefs at Los Angeles Chargers" }));
    await expect(await within(document.body).findByText("Could not follow that game")).toBeInTheDocument();
  },
};

/** Hue's cloud could not reach the bridge, so there are no rooms to pick. */
export const BridgeUnreachable: Story = {
  parameters: { api: { "GET /api/groups": failWith(500, "Hue Remote API GET /clip/v2/resource/room: HTTP 503") } },
};

export const GamesFailToLoad: Story = {
  parameters: { api: { "GET /api/games": failWith(500, "ESPN scoreboard returned HTTP 502") } },
};

export const StillLoading: Story = {
  parameters: { api: { "GET /api/groups": "pending", "GET /api/games": "pending" } },
};

/** Changing anything turns "Saved" back into "Save"; saving turns it back. */
export const EditAndSave: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = await canvas.findByRole("button", { name: "Saved" });
    await expect(save).toBeDisabled();
    // A switch, not the delay box: simulated keys don't reach Mantine's formatted number input.
    await userEvent.click(canvas.getByRole("button", { name: /Advanced/ }));
    await userEvent.click(await canvas.findByRole("switch", { name: "Extra point" }));
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByRole("button", { name: "Saved" })).toBeDisabled();
  },
};

export const SaveFails: Story = {
  parameters: { api: { "PUT /api/settings": failWith(422, 'Config "group" must be a non-empty string') } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Advanced/ }));
    await userEvent.click(await canvas.findByRole("switch", { name: "Extra point" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await within(document.body).findByText("Could not save")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
