#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { toLamp, type XY } from "./color.ts";
import { DEFAULT_CONFIG_PATH, effectFor, loadConfig } from "./config.ts";
import { fetchScoreboard, findGame, isTeam, LEAGUES, resolveLeague } from "./espn.ts";
import { discoverBridges, HueBridge } from "./hue.ts";
import { fullName, NFL_LEAGUE, NFL_TEAMS, requireNflTeam } from "./nfl.ts";
import { play, run, teamColors } from "./runner.ts";

const USAGE = `hue-live-sports <command> [options]

Commands
  discover          Find Hue bridges on this network
  pair              Create an app key (press the bridge's link button first)
  groups            List rooms and zones on the bridge
  game              Show the configured team's current game
  teams             List the 32 NFL teams and their lamp colours
  test <effect> [team]
                    Play one effect now, e.g. "us.touchdown", "them.score", "win".
                    Uses the configured team's colours, or [team]'s if given
  run               Watch the game and flash the lights

Options
  -c, --config <path>   Config file (default: ${DEFAULT_CONFIG_PATH})
      --ip <address>    Bridge address (default: $HUE_BRIDGE_IP)
      --dry-run         With run or test: log without touching the lights

Leagues: ${Object.keys(LEAGUES).join(", ")}, or an ESPN path like "soccer/eng.1"`;

function bridge(ip: string | undefined, needKey: boolean): HueBridge {
  const address = ip ?? process.env.HUE_BRIDGE_IP;
  if (!address) throw new Error("No bridge address. Set HUE_BRIDGE_IP in .env or pass --ip (see: discover).");
  const appKey = process.env.HUE_APP_KEY || undefined;
  if (needKey && !appKey) throw new Error("No app key. Set HUE_APP_KEY in .env (see: pair).");
  return new HueBridge({
    ip: address,
    appKey,
    caFile: process.env.HUE_CA_FILE || undefined,
    bridgeId: process.env.HUE_BRIDGE_ID || undefined,
  });
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string", short: "c", default: DEFAULT_CONFIG_PATH },
      ip: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, arg, teamArg] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return;
  }

  switch (command) {
    case "discover": {
      const found = await discoverBridges();
      if (found.length === 0) console.log("No bridges found. Check the Hue app for the bridge's IP address.");
      for (const b of found) console.log(`${b.ip}\t${b.id}`);
      return;
    }
    case "pair": {
      console.log(`Add this to .env:\nHUE_APP_KEY=${await bridge(values.ip, false).pair()}`);
      return;
    }
    case "groups": {
      for (const g of await bridge(values.ip, true).groups()) console.log(`${g.kind}\t${g.name}`);
      return;
    }
    case "game": {
      const config = loadConfig(values.config);
      const game = findGame(await fetchScoreboard(resolveLeague(config.league)), config.team);
      if (!game) {
        console.log(`${config.team} has no game on today's ${config.league} scoreboard.`);
        return;
      }
      console.log(`${game.name}: ${game.detail} (${game.state})`);
      for (const t of game.teams) {
        console.log(`  ${t.abbreviation.padEnd(5)} ${String(t.score).padStart(3)}  ${t.name}  #${t.color ?? "?"} / #${t.alternateColor ?? "?"}`);
      }
      return;
    }
    case "teams": {
      for (const division of new Set(NFL_TEAMS.map((t) => t.division))) {
        console.log(division);
        for (const t of NFL_TEAMS.filter((x) => x.division === division)) {
          console.log(`  ${t.abbr.padEnd(4)} ${fullName(t).padEnd(24)} ${t.colors.map((c) => `#${c}`).join(" ")}`);
        }
      }
      return;
    }
    case "test": {
      const config = loadConfig(values.config);
      if (!arg) throw new Error(`Name an effect to test: ${Object.keys(config.effects).join(", ")}`);
      const effect = effectFor(config, [arg]);
      if (!effect) throw new Error(`Effect "${arg}" is unknown or disabled in ${values.config}.`);
      const league = resolveLeague(config.league);
      const them = arg.startsWith("them.");

      let colors: XY[];
      if (effect.colors?.length) {
        colors = toLamp(effect.colors);
      } else if (league === NFL_LEAGUE && (teamArg || !them)) {
        // NFL colours are built in, so no game needs to be on.
        colors = teamColors(league, { abbreviation: requireNflTeam(teamArg ?? config.team).abbr });
      } else {
        // Otherwise colours come from the scoreboard, and only for teams playing today.
        const sides = (await fetchScoreboard(league).catch(() => []))
          .filter((g) => g.teams.some((t) => isTeam(t, teamArg ?? config.team)))
          .flatMap((g) => g.teams);
        const side = sides.find((t) => (teamArg ? isTeam(t, teamArg) : isTeam(t, config.team) !== them));
        if (!side) console.log("That team has no game listed today, so its colours are unknown: flashing white.");
        colors = teamColors(league, side);
      }

      const shown = colors.map((c) => `(${c.x}, ${c.y})`).join(" and ");
      if (values["dry-run"]) {
        console.log(`Would play "${arg}" for ${effect.seconds}s in xy ${shown}`);
        return;
      }
      const hue = bridge(values.ip, true);
      const group = await hue.findGroup(config.group);
      console.log(`Playing "${arg}" on ${group.name} for ${effect.seconds}s in xy ${shown}`);
      await play({ bridge: hue, group }, config, effect, colors);
      return;
    }
    case "run": {
      const config = loadConfig(values.config);
      const stop = new AbortController();
      for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => stop.abort());
      if (values["dry-run"]) {
        await run(config, undefined, stop.signal);
        return;
      }
      const hue = bridge(values.ip, true);
      await run(config, { bridge: hue, group: await hue.findGroup(config.group) }, stop.signal);
      return;
    }
    default:
      throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
