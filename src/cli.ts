#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { lampColors } from "./color.ts";
import { DEFAULT_CONFIG_PATH, effectFor, loadConfig } from "./config.ts";
import { fetchScoreboard, findGame, isTeam, LEAGUES, resolveLeague } from "./espn.ts";
import { discoverBridges, HueBridge } from "./hue.ts";
import { play, run } from "./runner.ts";

const USAGE = `hue-live-sports <command> [options]

Commands
  discover          Find Hue bridges on this network
  pair              Create an app key (press the bridge's link button first)
  groups            List rooms and zones on the bridge
  game              Show the configured team's current game
  test <effect>     Play one effect now, e.g. "us.touchdown", "them.score", "win"
  run               Watch the game and flash the lights

Options
  -c, --config <path>   Config file (default: ${DEFAULT_CONFIG_PATH})
      --ip <address>    Bridge address (default: $HUE_BRIDGE_IP)
      --dry-run         With run: log events without touching the lights

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
  const [command, arg] = positionals;
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
    case "test": {
      const config = loadConfig(values.config);
      if (!arg) throw new Error(`Name an effect to test: ${Object.keys(config.effects).join(", ")}`);
      const effect = effectFor(config, [arg]);
      if (!effect) throw new Error(`Effect "${arg}" is unknown or disabled in ${values.config}.`);
      // Team colours come from the scoreboard, so they are only known when a game is listed.
      const game = findGame(await fetchScoreboard(resolveLeague(config.league)).catch(() => []), config.team);
      const side = game?.teams.find((t) => isTeam(t, config.team) !== arg.startsWith("them."));
      const colors = lampColors(...(effect.colors ?? [side?.color, side?.alternateColor]));
      if (!effect.colors && !side) console.log("No game listed, so team colours are unknown: flashing white.");
      const hue = bridge(values.ip, true);
      const group = await hue.findGroup(config.group);
      console.log(`Playing "${arg}" on ${group.name} for ${effect.seconds}s`);
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
