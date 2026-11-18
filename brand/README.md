# Scorelights brand assets

Everything needed to put the Scorelights logo, icons and colors into the codebase. Write the name as one word with a lowercase l: "Scorelights".

## What's here

| Folder | Contents |
|---|---|
| `logo/` | The mark, wordmark and lockups as SVG. Text is converted to outlines, so no font is needed to display them. |
| `icons/` | Favicon, web app icons, the iOS app icon and a web manifest. |
| `tokens/` | Brand colors and font as CSS custom properties and as JSON. |
| `licenses/`, `CREDITS.md` | Icon and font licenses, and the credit line that must be published. |

## Logo files

- `mark-<sport>.svg`: the TV mark for dark backgrounds (slate bezel). Sports: `football`, `soccer`, `hockey`, `basketball`, `baseball`. Football is the default wherever the sport isn't known.
- `mark-<sport>-on-light.svg`: the same mark with a dark bezel, for light backgrounds.
- `mark-mono-dark.svg`, `mark-mono-light.svg`: one-color versions (dark for light backgrounds, light for dark backgrounds).
- `wordmark-on-dark.svg`, `wordmark-on-light.svg`: the name alone.
- `lockup-stacked-on-dark.svg`, `lockup-stacked-on-light.svg`: mark above the name, with "for Philips Hue" underneath.
- `lockup-horizontal-on-dark.svg`, `lockup-horizontal-on-light.svg`: small mark beside the name.

All logo SVGs have transparent backgrounds. The dark background color is `#0C1022`.

## Icons

Copy the contents of `icons/` to the web root (the manifest assumes root paths) and add to `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0C1022">
```

- `favicon.svg`, `favicon.ico` (16, 32, 48 px), `favicon-16.png`, `favicon-32.png`: square crop of the screen with a plain football.
- `apple-touch-icon.png` (180 px), `icon-192.png`, `icon-512.png`: the TV mark on the dark tile.
- `icon-maskable-512.png`: the same with extra padding for Android's icon masks.
- `app-icon-1024.png`: iOS App Store icon, square with no transparency; iOS rounds the corners itself.
- `app-icon.svg`, `app-icon-maskable.svg`: sources for the PNGs.

## Link-preview image

`social/share-card.html` lays out the 1200×630 image that link previews show (`web/public/og-image.png`, referenced by the `og:image` tag in `web/index.html`). It uses the real Outfit files from `node_modules`, so render it with headless Chrome after `bun install`:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=3000 \
  --allow-file-access-from-files --screenshot=web/public/og-image.png \
  "file://$PWD/brand/social/share-card.html"
```

Social sites cache previews, so a changed image may need a new file name to show up.

## Colors and type

`tokens/tokens.css` defines the colors as `--sl-*` custom properties, including `--sl-screen-fill`, the three-color fill used on the screen. On a score, swap `--sl-glow-warm` and `--sl-glow-cool` for the two teams' colors.

The typeface is Outfit (weights 500 and 700), from Google Fonts or the `@fontsource/outfit` package. The wordmark uses weight 700 with `letter-spacing: -0.02em`.

## Before shipping

Publish the credit line in `CREDITS.md`: three of the ball icons are CC BY 3.0 and require visible attribution.
