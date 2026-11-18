import { useComputedColorScheme } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { useId } from "react";
import { BALLS, HORIZONTAL_WORDMARK, type Lettering, SPORTS, STACKED_TAGLINE, STACKED_WORDMARK } from "./logoArt.ts";

/** Colours from `brand/tokens`: the bezel and lettering change with the background, the ball and screen don't. */
const COLOURS = {
  light: { bezel: "#0C1022", ink: "#0C1022", muted: "#4D5268" },
  dark: { bezel: "#2E3558", ink: "#F6F4EF", muted: "#C6CBDD" },
};
const BALL = "#0C1022";

/** Layouts of `brand/logo/lockup-*.svg`: where the TV mark (352 x 217) and the lettering sit. */
const LOCKUPS = {
  /** Small TV beside the name: the header. */
  horizontal: { width: 397.14, height: 92.44, mark: "translate(8 8) scale(0.352273)", lettering: [HORIZONTAL_WORDMARK], label: "Scorelights" },
  /** TV above the name, "for Philips Hue" underneath: the sign-in screen. */
  stacked: {
    width: 444.45,
    height: 378.92,
    mark: "translate(46.23 8)",
    lettering: [STACKED_WORDMARK, STACKED_TAGLINE],
    label: "Scorelights for Philips Hue",
  },
};

// The balls take turns on the screen, sliding in from the right: each holds, then slides out in a
// fraction of its turn. The strip ends with the first ball again, so the loop restarts unseen.
const STRIP = [...SPORTS, SPORTS[0]];
const STEP = 352; // wider than the screen, so one ball shows at a time
const TURN_SECONDS = 2.5;
const SLIDE = 0.2; // share of a turn spent sliding
const turns = SPORTS.length;
const keyTimes = [0];
const values = ["0 0"];
for (let i = 0; i < turns; i++) {
  keyTimes.push((i + 1 - SLIDE) / turns, (i + 1) / turns);
  values.push(`${-i * STEP} 0`, `${-(i + 1) * STEP} 0`);
}
const keySplines = Array.from({ length: turns }, () => ["0 0 1 1", "0.65 0 0.35 1"]).flat();

/**
 * The Scorelights logo, drawn inline from the brand's shapes so the TV can cycle through every
 * sport's ball. Still (football only) when the viewer asks for reduced motion or `animate` is off.
 * `size` is its height in pixels.
 */
export function Logo({
  variant = "horizontal",
  size = 44,
  animate = true,
}: {
  variant?: keyof typeof LOCKUPS;
  size?: number;
  animate?: boolean;
}) {
  const lockup = LOCKUPS[variant];
  const colours = COLOURS[useComputedColorScheme("light")];
  const moving = animate && !useReducedMotion();
  const id = `logo${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${lockup.width} ${lockup.height}`}
      height={size}
      width={Math.round((size * lockup.width) / lockup.height)}
      role="img"
      aria-label={lockup.label}
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <radialGradient id={`${id}-warm`} cx="0" cy="0.5" r="0.9" gradientTransform="translate(0 0.5) scale(1 1.4444) translate(0 -0.5)">
          <stop offset="0" stopColor="#FF9A3D" />
          <stop offset="0.18" stopColor="#FF9A3D" />
          <stop offset="0.75" stopColor="#FF9A3D" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-cool`} cx="1" cy="0.5" r="0.9" gradientTransform="translate(0 0.5) scale(1 1.4444) translate(0 -0.5)">
          <stop offset="0" stopColor="#3D6BFF" />
          <stop offset="0.18" stopColor="#3D6BFF" />
          <stop offset="0.75" stopColor="#3D6BFF" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-screen`}>
          <rect x="9" y="9" width="334" height="180" rx="19" />
        </clipPath>
      </defs>
      <g transform={lockup.mark}>
        <rect x="9" y="9" width="334" height="180" rx="19" fill="#FF3D9A" />
        <rect x="9" y="9" width="334" height="180" rx="19" fill={`url(#${id}-cool)`} />
        <rect x="9" y="9" width="334" height="180" rx="19" fill={`url(#${id}-warm)`} />
        <g clipPath={`url(#${id}-screen)`}>
          <g>
            {moving && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values={values.join(";")}
                keyTimes={keyTimes.join(";")}
                keySplines={keySplines.join(";")}
                calcMode="spline"
                dur={`${turns * TURN_SECONDS}s`}
                repeatCount="indefinite"
              />
            )}
            {(moving ? STRIP : STRIP.slice(0, 1)).map((sport, i) => (
              <g key={i} transform={`translate(${i * STEP} 0)`}>
                <g transform={BALLS[sport].transform} fill={BALL}>
                  {BALLS[sport].paths.map((d) => (
                    <path key={d.slice(0, 24)} d={d} />
                  ))}
                </g>
              </g>
            ))}
          </g>
        </g>
        <rect x="4.5" y="4.5" width="343" height="189" rx="23.5" fill="none" stroke={colours.bezel} strokeWidth="9" />
        <rect x="156" y="197" width="40" height="12" fill={colours.bezel} />
        <rect x="109.2" y="208" width="133.6" height="9" rx="4" fill={colours.bezel} />
      </g>
      {lockup.lettering.map((lettering, i) => (
        <Letters key={i} lettering={lettering} fill={i === 0 ? colours.ink : colours.muted} />
      ))}
    </svg>
  );
}

function Letters({ lettering, fill }: { lettering: Lettering; fill: string }) {
  return (
    <g transform={lettering.transform} fill={fill}>
      {lettering.glyphs.map((g) => (
        <path key={g.x} transform={`translate(${g.x} 0)`} d={g.d} />
      ))}
    </g>
  );
}
