# hue-live-sports

Flashes Philips Hue lights on live sports events. A Bun + TypeScript CLI that learns scores from ESPN's scoreboard (polling) and/or pushed webhooks, infers events from score changes, and plays effects through the Hue Bridge's local API (CLIP v2). See `README.md` for user-facing setup and config.

## Commands

```sh
bun install
bun run typecheck      # tsc --noEmit
bun test               # all tests; Hue client tests need `openssl`, skipped without it
bun start <command>    # discover | pair | groups | games | teams | test | emit | run
bun run compile        # standalone binary at dist/hue-live-sports
```

Run `bun run typecheck` and `bun test` before committing. There is no build step: Bun runs the TypeScript directly and loads `.env` itself.

## Architecture

Data flows one way: sources -> tracker -> events -> dispatcher -> bridge.

| File | Role |
| --- | --- |
| `src/sources/poll.ts` | Polls ESPN and hands the whole scoreboard to the tracker |
| `src/sources/webhook.ts` | Signed HTTP receiver; `WebhookAdapter` maps a provider payload to snapshots. Only the `generic` adapter exists |
| `src/tracker.ts` | Last known state of every followed game; merges sources so each play fires once |
| `src/events.ts` | `detectEvents` diffs two snapshots of a game; `eventKeys` maps an event to config keys |
| `src/runner.ts` | Wires sources to the tracker; the dispatcher queues effects and picks colours |
| `src/hue.ts` | Bridge client: pairing, rooms/zones, `signal` (bridge-run flash) and `pulse` (manual flash + restore) |
| `src/espn.ts` | The only file that knows ESPN's response shape; defines `GameSnapshot` |
| `src/nfl.ts` | The 32 NFL teams, aliases and lamp colours |
| `src/config.ts` | Config parsing, validation and default effects |
| `src/color.ts` | Hex to CIE xy conversion |
| `src/cli.ts` | Command-line entry point |

## Rules that are easy to break

- **Events come from score deltas, not play data.** A touchdown is "+6 or more in football". Do not assume a source can name the play.
- **The tracker owns deduplication.** Sources must not diff or dedupe themselves; they report what they see. The merge rules (stale lower scores, state never moving backwards, late redeliveries) live in `Tracker.merge` and are covered by `test/tracker.test.ts`.
- **Games are matched across sources by their two team abbreviations**, never by id. Anything producing a `GameSnapshot` must pass team names through `canonicalAbbreviation`.
- **A game's first sighting only sets a baseline** and fires nothing, so starting mid-game does not replay the score.
- **Effect sides:** `us`/`them` exist only in a followed team's game; with no `teams` configured every score is `any`.
- **NFL colours in `src/nfl.ts` are lamp colours, not brand colours** (black dropped, silver as white, some shades saturated). They were chosen without seeing real bulbs.
- **`createWebhookHandler` must stay a plain `Request -> Response` function** with no Bun-specific calls, so it can run as a Cloudflare Worker.
- **The bridge certificate is self-signed for the bridge id.** Verification is off unless `HUE_CA_FILE` is set; keep that scoped to bridge requests.

## Verified against the real world

Phase one (the local service) has run end to end against live systems:

- **ESPN parsing** works on the live NFL scoreboard. ESPN's Akamai edge returns 403 to Bun's default User-Agent, so `fetchScoreboard` sends its own; keep it.
- **The Hue client** has flashed real lights through a real bridge in the default `"effectMode": "signal"`. A live Chargers score showed their blue.

Still unverified:

- **No provider webhook adapter exists.** Write one from real sample payloads and headers, not from documentation summaries.
- **NFL lamp colours** other than LAC's have not been reviewed on real bulbs.

## Direction

The end goal is ordinary fans, not developers. The current local service is phase one. The likely public shape is an iOS app as the setup screen for a cloud service (Cloudflare Workers) that receives score webhooks and calls Hue's Remote API. Keep the core (events, tracker, team table, effects) free of Node/Bun-only and local-network assumptions so it can move there.

Open questions: which licensed score feed to use, Hue Remote API quotas for per-user fan-out, and feed lag relative to TV.

## Workflow

- Work directly on `main`; no pull requests for now.
- Secrets live in `.env` (`HUE_APP_KEY`, `WEBHOOK_SECRET`); `.env` and `config.json` are gitignored.
