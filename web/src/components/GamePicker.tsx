import { Alert, Button, Group, Select, Skeleton, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { api, type FollowedGame, type Game, type League } from "../api.ts";
import { errorMessage, type Load } from "../load.ts";
import { GameCard } from "./GameCard.tsx";
import { LeagueLogo } from "./LeagueLogo.tsx";

/** Live scores move, so the list is fetched again this often while the page is open. */
const REFRESH_MS = 30_000;

interface Props {
  leagues: League[];
  league: string;
  onLeague: (league: string) => void;
  followed?: FollowedGame;
  /** The key of the game being followed right now, or "stop". */
  busy?: string | null;
  onFollow: (game: Game) => void;
  onStop: () => void;
}

/** The followed game, if any, then the league's live and upcoming games to pick from. */
export function GamePicker({ leagues, league, onLeague, followed, busy, onFollow, onStop }: Props) {
  const [games, setGames] = useState<Load<Game[]>>({ state: "loading" });

  useEffect(() => {
    setGames({ state: "loading" });
    let current = true;
    const load = () =>
      api
        .games(league)
        .then((value) => current && setGames({ state: "ready", value }))
        .catch((err) => current && setGames((g) => (g.state === "ready" ? g : { state: "error", message: errorMessage(err) })));
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [league]);

  const list = games.state === "ready" ? games.value : [];
  const live = followed && list.find((g) => g.key === followed.key && g.league === followed.league);
  const others = list.filter((g) => g !== live);
  const current = leagues.find((l) => l.id === league);
  const leagueName = current?.name ?? league;

  return (
    <Stack gap="md">
      {followed && (
        <GameCard
          game={live ?? followed}
          following
          action={
            <Button variant="default" size="xs" onClick={onStop} loading={busy === "stop"} disabled={Boolean(busy) && busy !== "stop"}>
              Stop
            </Button>
          }
        />
      )}
      <Select
        size="md"
        label={followed ? "Or switch to another game" : "League"}
        data={leagues.map((l) => ({ value: l.id, label: l.name }))}
        leftSection={<LeagueLogo logo={current?.logo} />}
        renderOption={({ option }) => (
          <Group gap="sm" wrap="nowrap">
            <LeagueLogo logo={leagues.find((l) => l.id === option.value)?.logo} />
            {option.label}
          </Group>
        )}
        value={league}
        onChange={(v) => v && onLeague(v)}
        allowDeselect={false}
        searchable
      />
      {games.state === "loading" && (
        <Stack gap="sm" aria-label="Loading games">
          <Skeleton height={86} radius="md" />
          <Skeleton height={86} radius="md" />
        </Stack>
      )}
      {games.state === "error" && <Alert color="red">Could not load the games: {games.message}</Alert>}
      {games.state === "ready" && others.length === 0 && (
        <Text c="dimmed" size="sm">
          {live ? `No other ${leagueName} games` : `No ${leagueName} games`} live or starting in the next day.
        </Text>
      )}
      {others.map((g) => (
        <GameCard
          key={g.key}
          game={g}
          action={
            <Button
              variant="light"
              size="xs"
              onClick={() => onFollow(g)}
              loading={busy === g.key}
              disabled={Boolean(busy) && busy !== g.key}
              aria-label={`Follow ${g.away.name} at ${g.home.name}`}
            >
              Follow
            </Button>
          }
        />
      ))}
    </Stack>
  );
}
