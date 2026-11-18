# Scorelights: product brief

A self-contained description of the product, for research and design work. It assumes no access to the code.

## In one line

**Scorelights for Philips Hue** flashes your Hue lights in the scoring team's colors every time someone scores in the game you're watching.

## What it does

- A fan signs in with their Philips Hue account, picks a room, and taps the game they're watching: one that's live, or one starting within a day.
- Every score in that game flashes the room in the scoring team's colors. Both teams' scores flash, not only one side's.
- Kickoff and the final whistle flash too. The win flashes in the winner's colors, a draw in both teams' colors.
- Following ends on its own at the final. The next game is picked the same way; there are no favorite-team settings.
- A **TV delay** setting holds the flashes back so they don't spoil a stream that runs behind live.
- When the flash ends, the lights go back to how they were.
- It runs entirely in the cloud. There's nothing to install and no app that has to stay open during the game.

### What flashes, by default

| Sport | Flashes |
|---|---|
| American football | Touchdown (10 s, alternating colors), field goal, two-point conversion or safety. Extra points are off, since they follow almost every touchdown |
| Soccer, hockey | Goal (10 s, alternating colors) |
| Baseball | Run |
| Basketball | Only tip-off and the final result. Single baskets are off, since they'd flash constantly |
| Every sport | Kickoff, win, draw |

Advanced settings let a fan turn events on or off, change how long a flash lasts, and override the colors.

### Leagues

NFL, college football, NBA, WNBA, NHL, MLB, MLS, Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Brasileirão and the Champions League.

## Who it's for

**Ordinary sports fans who already own Philips Hue color lights**, not smart-home hobbyists. The setup screen is kept deliberately simple: pick the game, pick the room. Anything technical sits behind "Advanced".

The main market is US sports fans: the NFL first, then the NBA, NHL and MLB. Soccer fans in Europe and Brazil come second.

## Requirements

- A Philips Hue Bridge (any current model) and at least one color-capable Hue light.
- A Philips Hue account; sign-in happens on Philips Hue's own site, and the service never sees the password.
- Any browser. A web app today, an iOS app planned.

## How it works (plain version)

1. The service follows the live scoreboard of every game that someone is watching.
2. It works out what happened from the change in score: +6 or more in football is a touchdown, +3 a field goal, +1 in soccer a goal. It never sees play-by-play data.
3. It sends the flash to the fan's lights through Philips Hue's official cloud API, after any TV delay the fan has set.

There are no accounts beyond the Hue bridge itself: the bridge is the identity.

## Brand

- **Name:** Scorelights. This is final.
  - Write it as one word with a lowercase L: "Scorelights", never "ScoreLights" or "Score Lights".
  - The user doesn't want the word "lamp" anywhere in the brand.
- **Descriptor:** "Scorelights for Philips Hue", or "Works with Philips Hue".
- **Domain:** scorelights.app.
- **Tone:** fun, game-day energy, aimed at ordinary fans. Plain words, no smart-home jargon.
- **Current headline on the sign-in screen:** "Make your living room part of the game."
- **Color:** the flashes always use team colors, so the brand can't own a team color. The current placeholder accent is orange (#f76707).

### Trademark limits (from Signify's Hue developer terms, September 2025 version, section 8(a)(xi))

- **No Hue, Philips Hue, Philips or Signify branding, trademarks or trade dress in any logo or graphics.** That rules out Hue's wordmark, its gradient, and its bulb or light artwork.
- "Works with Philips Hue" and "for Philips Hue" may be used in material about the app.
- The product must make clear that it comes from an independent developer, not from Signify.
- Philips' general trademark guidelines bar Philips marks in third parties' names and domains.

### Logo: what's been tried

Nothing has been chosen. The aim is a mark that:

- can be cut down to a simple version for the favicon (the full logo doesn't have to work at 16 px);
- works as an iOS app icon;
- works in one color and on both light and dark backgrounds;
- sits next to the wordmark "Scorelights".

Already rejected:

- **The Hue wordmark with "Live Sports" under it.** It breaks the Hue terms above.
- **Six simple marks:**
  - a dot with flash rays;
  - a circle split into two team colors;
  - a four-point spark;
  - an S drawn in two colors;
  - a dot with a few off-center rays;
  - a scoreboard with two lit digits.
- **Six richer versions of the spark**, the closest direction so far, which the user found too simple:
  - with speed lines;
  - cut out of an app tile;
  - with diagonal glint rays;
  - inside a broken halo ring;
  - split into two colors;
  - as the dot over the "i" in "Scorelights".

None of these was liked. Two cautions:

- **A bare four-point sparkle now reads as an "AI feature" icon.** Avoid it unless something changes that.
- **Sun, brightness and generic light-bulb icons** are already used everywhere in smart-home apps.

## Competitors and context

- **Philips Hue Sports Live:** Philips' own feature, built into the Hue app for the 2026 FIFA World Cup. Lights flashed in the scoring team's colors on goals, cards and the win, with a delay setting. It covered only that tournament and went away after it. No other sports have been announced.
- **Sport Lights for Philips Hue:** an iOS app with Hue scoring flashes for the NFL and other leagues. The app has to keep running in the background, flashes arrive about 15 seconds after the score, and football costs $2.99 a year.
- **ConnectedRoom:** a web service with a page for every team that promises real-time Hue flashes on touchdowns.
- **Do-it-yourself setups:** Home Assistant, IFTTT and Node-RED recipes for hobbyists.

**Positioning:** Sports Live without the World Cup limit. It covers the leagues US fans watch every week, it's free, there's nothing to install, and you pick the game in a tap.

## Status and honest limits

- **Not yet promoted publicly.** It's free and there's no business model yet.
- **Production test:** the hosted version has flashed real lights from the cloud, but a full live game hasn't yet been seen end to end in production.
- **Feed timing:** the score feed can run ahead of or behind a TV broadcast. Choosing a licensed feed is an open question.
- **Rate limits:** the limits of Philips' cloud API, and so how many users it can serve, haven't been measured.
- **Limits of inferring from scores:**
  - Two points in football could be a conversion or a safety.
  - Cards, penalties and other plays that don't change the score aren't detected.
- **Team colors** are tuned for light bulbs rather than copied from brand guides. Most haven't been checked on real bulbs.

## Useful research questions

- Logo and wordmark directions that say "the moment someone scores" and "light", without Hue artwork, AI sparkles or generic bulbs.
- Typefaces that feel like game day but stay readable at small sizes.
- Where Hue-owning sports fans gather, and how to reach them without spamming.
- Licensed score feeds with low latency and push delivery, and what they cost for a small service.
- Whether fans would pay, and how (yearly, per season, per league), compared with Sport Lights' $2.99 a year.
