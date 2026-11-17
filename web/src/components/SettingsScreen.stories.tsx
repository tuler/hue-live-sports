import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { failWith, ME_NEW, ME_SAVED, SAVED } from "../stories/fakeApi.ts";
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

/** A returning fan: two NFL teams, a 20 s delay. Rooms and teams load from the fake /api. */
export const Saved: Story = {};

/** Straight after the first sign-in: nothing saved yet. */
export const NewUser: Story = { args: { me: ME_NEW } };

export const EveryTeam: Story = { args: { me: { ...ME_SAVED, settings: { ...SAVED, teams: [] } } } };

export const PremierLeague: Story = {
  args: { me: { ...ME_SAVED, settings: { ...SAVED, league: "epl", teams: ["LIV", "ARS"] } } },
};

/** Hue's cloud could not reach the bridge, so there are no rooms to pick. */
export const BridgeUnreachable: Story = {
  parameters: { api: { "GET /api/groups": failWith(500, "Hue Remote API GET /clip/v2/resource/room: HTTP 503") } },
};

export const TeamsFailToLoad: Story = {
  parameters: { api: { "GET /api/teams": failWith(500, "ESPN teams list returned HTTP 502") } },
};

export const StillLoading: Story = {
  parameters: { api: { "GET /api/groups": "pending", "GET /api/teams": "pending" } },
};

/** Changing anything turns "Saved" back into "Save"; saving turns it back. */
export const EditAndSave: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = await canvas.findByRole("button", { name: "Saved" });
    await expect(save).toBeDisabled();
    // A switch, not the delay box: simulated keys don't reach Mantine's formatted number input.
    await userEvent.click(canvas.getByRole("switch", { name: "Follow every team in the league" }));
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByRole("button", { name: "Saved" })).toBeDisabled();
  },
};

export const SaveFails: Story = {
  parameters: { api: { "PUT /api/settings": failWith(422, 'Config "group" must be a non-empty string') } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("switch", { name: "Follow every team in the league" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await within(document.body).findByText("Could not save")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
