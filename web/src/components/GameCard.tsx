import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { FollowedGame, Game, GameTeam } from "../api.ts";
import { startTime } from "../time.ts";
import { Swatches } from "./Swatches.tsx";

interface Props {
  /** A game from the list, or the followed game as saved (no score or status). */
  game: Game | FollowedGame;
  following?: boolean;
  /** A button on the right: follow, or stop. */
  action?: ReactNode;
}

function TeamRow({ team, live }: { team: GameTeam; live: boolean }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Swatches colors={team.colors} />
      <Text size="sm" fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
        {team.name}
      </Text>
      {live && team.score !== undefined && (
        <Text size="sm" fw={700} miw={24} ta="right">
          {team.score}
        </Text>
      )}
    </Group>
  );
}

/** One game: both teams in their colours, the score while live or the start time before. */
export function GameCard({ game, following = false, action }: Props) {
  const live = "state" in game && game.state === "in";
  const detail = "detail" in game ? game.detail : "";
  const status = live ? detail : game.startsAt ? startTime(game.startsAt) : detail;
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={following ? { borderColor: "var(--mantine-primary-color-filled)", borderWidth: 2 } : undefined}
    >
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          <TeamRow team={game.away} live={live} />
          <TeamRow team={game.home} live={live} />
          <Group gap="xs">
            {following && (
              <Badge size="sm" variant="filled">
                Following
              </Badge>
            )}
            {live && (
              <Badge size="sm" color="red" variant="dot">
                Live
              </Badge>
            )}
            <Text size="xs" c="dimmed">
              {status}
            </Text>
          </Group>
        </Stack>
        {action}
      </Group>
    </Paper>
  );
}
