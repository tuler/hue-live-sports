# hue-live-sports

Flash Philips Hue lights when your team scores: touchdowns, field goals, goals, runs, kickoff and the final whistle.

It polls ESPN's public scoreboard, works out what happened from the change in score, and plays an effect in the scoring team's colours through the Hue Bridge's local API. Nothing leaves your network except the scoreboard request.

## Setup

Needs [Bun](https://bun.sh) 1.2+ and a Hue Bridge on the same network.

```sh
bun install
cp .env.example .env
cp config.example.json config.json

bun start discover        # find the bridge, put its IP in .env
bun start pair            # press the bridge's link button first, then put the key in .env
bun start groups          # room and zone names for config.json
bun start game            # check that your team's game is found
bun start test us.touchdown
bun start run             # add --dry-run to log events without touching the lights
```

Bun runs the TypeScript directly and loads `.env` itself, so there is no build step. `bun run compile` produces a standalone binary at `dist/hue-live-sports` for a machine without Bun.

## Config

| Key | Default | Meaning |
| --- | --- | --- |
| `league` | | `nfl`, `ncaaf`, `nba`, `wnba`, `nhl`, `mlb`, `mls`, `epl`, `laliga`, `bundesliga`, `seriea`, `ligue1`, `brasileirao`, `ucl`, or any ESPN path such as `soccer/ned.1` |
| `team` | | ESPN abbreviation (`NYG`) or full name |
| `group` | | Hue room or zone to flash |
| `pollSeconds` | `10` | Poll interval while the game is live (minimum 5) |
| `delaySeconds` | `0` | Hold effects back to match a delayed TV stream |
| `effectMode` | `signal` | `signal` lets the bridge run the flash and restore the lights. `pulse` flashes by hand, for lights that ignore signaling |
| `effects` | see below | Per-event overrides |

Each effect is `{ "enabled", "seconds", "signal", "colors" }`. `signal` is `alternating` (two colours) or `on_off_color` (one). `colors` is an optional list of hex colours that replaces the team's own.

Effect keys are `us.<kind>` and `them.<kind>`, falling back to `us.score` and `them.score`, plus `game_start`, `win`, `loss` and `draw`. Kinds: `touchdown`, `field_goal`, `two_points`, `extra_point`, `goal`, `run`, `basket`, `score`. Defaults are in [`src/config.ts`](src/config.ts); baskets and losses are off.

## Limits

- **The feed can run ahead of or behind your TV.** `delaySeconds` fixes a feed that spoils the play. Nothing fixes a feed that is late.
- **ESPN's scoreboard is undocumented** and can change or lag without notice. `src/espn.ts` is the only file that knows its shape.
- **Events are inferred from the score.** Two football points could be a conversion or a safety, and a touchdown plus its extra point inside one poll reads as a single 7-point touchdown. Cards, penalties and other non-scoring plays are not detected.
- **The bridge certificate is not verified by default**, since it is issued by Signify's private CA for the bridge id rather than its IP. To verify it, set `HUE_CA_FILE` to the Hue root CA and `HUE_BRIDGE_ID` to the bridge id.

## Development

```sh
bun run typecheck
bun test
```

The Hue client tests start a local HTTPS stand-in for the bridge and need `openssl` to mint its certificate; they are skipped without it.
