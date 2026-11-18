import { Badge, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { FollowedGame, Game, GameTeam } from "../api.ts";
import { startTime } from "../time.ts";
import classes from "./GameCard.module.css";
import { Swatches } from "./Swatches.tsx";

interface Props {
  /** A game from the list, or the followed game as saved (no score or status). */
  game: Game | FollowedGame;
  following?: boolean;
  /** A button at the bottom right, such as Stop. Not used together with `onSelect`. */
  action?: ReactNode;
  /** Makes the whole card a button, with a "Follow" hint at the bottom right. */
  onSelect?: () => void;
  /** `onSelect` is running: the hint turns into a spinner. */
  selecting?: boolean;
  disabled?: boolean;
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
export function GameCard({ game, following = false, action, onSelect, selecting = false, disabled = false }: Props) {
  const live = "state" in game && game.state === "in";
  const detail = "detail" in game ? game.detail : "";
  const status = live ? detail : game.startsAt ? startTime(game.startsAt) : detail;
  const hint = onSelect && (
    <Group gap={2} c="var(--sl-accent-text)" wrap="nowrap" style={{ flexShrink: 0 }}>
      {selecting ? (
        <Loader size={14} />
      ) : (
        <>
          <Text size="xs" fw={600} c="inherit">
            Follow
          </Text>
          <ChevronRight size={14} aria-hidden />
        </>
      )}
    </Group>
  );
  const body = (
    <Stack gap={6}>
      <TeamRow team={game.away} live={live} />
      <TeamRow team={game.home} live={live} />
      {/* Status on the left, the action on the right: the scores keep the right edge of the rows above. */}
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Group gap="xs" style={{ minWidth: 0 }}>
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
        {action ?? hint}
      </Group>
    </Stack>
  );

  if (onSelect) {
    return (
      <Paper
        component="button"
        type="button"
        withBorder
        radius="md"
        p="sm"
        className={classes.selectable}
        onClick={onSelect}
        disabled={disabled || selecting}
        aria-busy={selecting || undefined}
      >
        {body}
      </Paper>
    );
  }
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={following ? { borderColor: "var(--mantine-primary-color-filled)", borderWidth: 2 } : undefined}
    >
      {body}
    </Paper>
  );
}
