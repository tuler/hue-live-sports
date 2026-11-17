import { Alert, Button, Skeleton, Stack, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { api, type FollowedGame, type Game, type League, type LeagueCounts } from "../api.ts";
import { errorMessage, type Load } from "../load.ts";
import { GameCard } from "./GameCard.tsx";
import { LeaguePicker } from "./LeaguePicker.tsx";

/** Live scores move, so the list is fetched again this often while the page is open. */
const REFRESH_MS = 30_000;
/** Which leagues have games changes slowly, and the server keeps its answer a minute anyway. */
const COUNTS_REFRESH_MS = 3 * 60_000;

const hasGames = (counts: LeagueCounts, id: string) => {
  const c = counts[id];
  return c != null && c.live + c.upcoming > 0;
};

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
  const [counts, setCounts] = useState<LeagueCounts>();
  const openedOnGames = useRef(false);

  useEffect(() => {
    let current = true;
    // Without counts nothing is dimmed, so a failure here costs nothing.
    const load = () => api.leagueCounts().then((value) => current && setCounts(value), () => {});
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), COUNTS_REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);

  // Once, when the counts first arrive: don't open on a league with nothing to follow while another has
  // games. Prefer one with a game live now. Not when following a game: its league is the one to show.
  useEffect(() => {
    if (!counts || openedOnGames.current) return;
    openedOnGames.current = true;
    if (followed || counts[league] == null || hasGames(counts, league)) return;
    const next = leagues.find((l) => (counts[l.id]?.live ?? 0) > 0) ?? leagues.find((l) => hasGames(counts, l.id));
    if (next) onLeague(next.id);
  }, [counts]);

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
  const leagueName = leagues.find((l) => l.id === league)?.name ?? league;

  return (
    <Stack gap="md">
      {followed && (
        <GameCard
          game={live ?? followed}
          following
          action={
            // Compact, and overhanging the status row by 2px each way, so the row is as tall as on every other card.
            <Button
              variant="default"
              size="compact-xs"
              my={-2}
              onClick={onStop}
              loading={busy === "stop"}
              disabled={Boolean(busy) && busy !== "stop"}
            >
              Stop
            </Button>
          }
        />
      )}
      <LeaguePicker
        leagues={leagues}
        value={league}
        onChange={onLeague}
        label={followed ? "Or switch to another game" : "League"}
        counts={counts}
        keep={followed ? [followed.league] : []}
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
          onSelect={() => onFollow(g)}
          selecting={busy === g.key}
          disabled={Boolean(busy) && busy !== g.key}
        />
      ))}
    </Stack>
  );
}
