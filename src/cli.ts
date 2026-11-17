#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { toLamp, type XY } from "./color.ts";
import { DEFAULT_CONFIG_PATH, effectFor, loadConfig } from "./config.ts";
import { fetchScoreboard, followedGames, isTeam, LEAGUES, resolveLeague } from "./espn.ts";
import { discoverBridges, HueBridge } from "./hue.ts";
import { localTransport } from "./hue-local.ts";
import { codeFromRedirect, HueRemoteAuth, remoteTransport } from "./hue-remote.ts";
import { fullName, NFL_LEAGUE, NFL_TEAMS, requireNflTeam } from "./nfl.ts";
import { play, run, teamColors } from "./runner.ts";
import { signGeneric } from "./sources/webhook.ts";
import { DEFAULT_TOKEN_FILE, fileTokenStore } from "./token-file.ts";

const USAGE = `hue-live-sports <command> [options]

Commands
  discover          Find Hue bridges on this network
  pair              Create an app key (press the bridge's link button first;
                    with --remote, the button is pressed for you)
  remote-auth       Sign in to the Hue Remote API and save its tokens
  groups            List rooms and zones on the bridge
  games             Show the games being followed
  teams             List the 32 NFL teams and their lamp colours
  test <effect> [team]
                    Play one effect now, e.g. "touchdown KC", "win".
                    Uses [team]'s colours, else the first tracked team's
  run               Watch the games and flash the lights
  emit <home> <score> <away> <score> [pre|in|post]
                    Send a signed test update to the webhook receiver

Options
  -c, --config <path>   Config file (default: ${DEFAULT_CONFIG_PATH})
      --ip <address>    Bridge address (default: $HUE_BRIDGE_IP)
      --url <url>       With emit: receiver to post to (default: from the config)
      --remote          Reach the bridge through the Hue Remote API instead of the LAN
      --dry-run         With run or test: log without touching the lights

Leagues: ${Object.keys(LEAGUES).join(", ")}, or an ESPN path like "soccer/eng.1"`;

interface BridgeFlags {
  ip?: string;
  remote: boolean;
}

function remoteAuth(): HueRemoteAuth {
  const clientId = process.env.HUE_CLIENT_ID;
  const clientSecret = process.env.HUE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Set HUE_CLIENT_ID and HUE_CLIENT_SECRET in .env (from your app at developers.meethue.com).");
  }
  const store = fileTokenStore(process.env.HUE_TOKEN_FILE || DEFAULT_TOKEN_FILE);
  return new HueRemoteAuth({ clientId, clientSecret, store });
}

function bridge(flags: BridgeFlags, needKey: boolean): HueBridge {
  const appKey = process.env.HUE_APP_KEY || undefined;
  if (needKey && !appKey) throw new Error(`No app key. Set HUE_APP_KEY in .env (see: pair${flags.remote ? " --remote" : ""}).`);
  if (flags.remote) return new HueBridge(remoteTransport(remoteAuth(), { appKey }));

  const address = flags.ip ?? process.env.HUE_BRIDGE_IP;
  if (!address) throw new Error("No bridge address. Set HUE_BRIDGE_IP in .env or pass --ip (see: discover).");
  return new HueBridge(
    localTransport({
      ip: address,
      appKey,
      caFile: process.env.HUE_CA_FILE || undefined,
      bridgeId: process.env.HUE_BRIDGE_ID || undefined,
    }),
  );
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string", short: "c", default: DEFAULT_CONFIG_PATH },
      ip: { type: "string" },
      url: { type: "string" },
      remote: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, arg, teamArg] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return;
  }

  const flags: BridgeFlags = { ip: values.ip, remote: values.remote };

  switch (command) {
    case "discover": {
      const found = await discoverBridges();
      if (found.length === 0) console.log("No bridges found. Check the Hue app for the bridge's IP address.");
      for (const b of found) console.log(`${b.ip}\t${b.id}`);
      return;
    }
    case "pair": {
      const hue = bridge(flags, false);
      if (flags.remote) await hue.pressLinkButton();
      const key = await hue.pair(flags.remote ? "hue-live-sports#remote" : undefined);
      console.log(`Add this to .env:\nHUE_APP_KEY=${key}`);
      return;
    }
    case "remote-auth": {
      const auth = remoteAuth();
      const state = crypto.randomUUID();
      console.log(`1. Open this link and allow access to your bridge:\n\n   ${auth.authorizeUrl(state)}\n`);
      console.log("2. Hue then sends your browser to the app's callback URL. The page may not load; that is fine.");
      const pasted = prompt("3. Paste the full address from the browser's address bar (or just the code):");
      if (!pasted) throw new Error("Nothing pasted.");
      const tokens = await auth.exchangeCode(codeFromRedirect(pasted, state));
      const file = process.env.HUE_TOKEN_FILE || DEFAULT_TOKEN_FILE;
      console.log(`Saved tokens to ${file}; the access token is good until ${new Date(tokens.expiresAt).toLocaleString()}.`);
      console.log(`Next: "groups --remote". If the app key is refused, run "pair --remote" for one made remotely.`);
      return;
    }
    case "groups": {
      for (const g of await bridge(flags, true).groups()) console.log(`${g.kind}\t${g.name}`);
      return;
    }
    case "game":
    case "games": {
      const config = loadConfig(values.config);
      const games = followedGames(await fetchScoreboard(resolveLeague(config.league)), config.teams);
      if (games.length === 0) {
        console.log(`No ${config.teams.join(", ") || config.league} games on the scoreboard right now.`);
        return;
      }
      for (const g of games) {
        const score = g.teams.map((t) => `${t.abbreviation} ${t.score}`).join(" - ");
        console.log(`${g.state.padEnd(4)} ${score.padEnd(18)} ${g.detail}`);
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

      // Whose colours to show: the named team, else the first tracked team.
      const name = teamArg ?? config.teams[0];
      let colors: XY[];
      if (effect.colors?.length) {
        colors = toLamp(effect.colors);
      } else if (league === NFL_LEAGUE) {
        // NFL colours are built in, so no game needs to be on.
        if (!name) throw new Error(`Name a team to preview, e.g. "test ${arg} KC" (see: teams).`);
        colors = teamColors(league, { abbreviation: requireNflTeam(name).abbr });
      } else {
        // Other leagues take colours from the scoreboard, so only for teams playing today.
        const games = await fetchScoreboard(league).catch(() => []);
        if (!name) throw new Error(`Name a team to preview, e.g. "test ${arg} <team>".`);
        const side = games.flatMap((g) => g.teams).find((t) => isTeam(t, name));
        if (!side) console.log("That team has no game listed today, so its colours are unknown: flashing white.");
        colors = teamColors(league, side);
      }

      const shown = colors.map((c) => `(${c.x}, ${c.y})`).join(" and ");
      if (values["dry-run"]) {
        console.log(`Would play "${arg}" for ${effect.seconds}s in xy ${shown}`);
        return;
      }
      const hue = bridge(flags, true);
      const group = await hue.findGroup(config.group);
      console.log(`Playing "${arg}" on ${group.name} for ${effect.seconds}s in xy ${shown}`);
      await play({ bridge: hue, group }, config, effect, colors);
      return;
    }
    case "emit": {
      // A signed generic payload, for trying the receiver without a provider.
      const [home, homeScore, away, awayScore, state = "in"] = positionals.slice(1);
      if (!home || !away || homeScore === undefined || awayScore === undefined) {
        throw new Error("Usage: emit <home> <score> <away> <score> [pre|in|post]");
      }
      const config = loadConfig(values.config);
      const secret = process.env.WEBHOOK_SECRET;
      if (!secret) throw new Error("Set WEBHOOK_SECRET in .env first.");
      const hook = config.webhook ?? { host: "127.0.0.1", port: 8787, path: "/webhook" };
      const url = values.url ?? `http://${hook.host}:${hook.port}${hook.path}`;
      const body = JSON.stringify({
        state,
        at: new Date().toISOString(),
        home: { team: home, score: Number(homeScore) },
        away: { team: away, score: Number(awayScore) },
      });
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...signGeneric(body, secret) },
        body,
      });
      console.log(`${res.status} ${await res.text()}`);
      if (!res.ok) process.exitCode = 1;
      return;
    }
    case "run": {
      const config = loadConfig(values.config);
      const stop = new AbortController();
      for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => stop.abort());
      if (values["dry-run"]) {
        await run(config, undefined, stop.signal, { webhookSecret: process.env.WEBHOOK_SECRET });
        return;
      }
      const hue = bridge(flags, true);
      await run(config, { bridge: hue, group: await hue.findGroup(config.group) }, stop.signal, {
        webhookSecret: process.env.WEBHOOK_SECRET,
      });
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
