import { Image } from "@mantine/core";
import horizontalOnDark from "../../../brand/logo/lockup-horizontal-on-dark.svg";
import horizontalOnLight from "../../../brand/logo/lockup-horizontal-on-light.svg";
import stackedOnDark from "../../../brand/logo/lockup-stacked-on-dark.svg";
import stackedOnLight from "../../../brand/logo/lockup-stacked-on-light.svg";

const LOCKUPS = {
  /** Small TV mark beside the name: the header. */
  horizontal: { light: horizontalOnLight, dark: horizontalOnDark, label: "Scorelights" },
  /** TV mark above the name, "for Philips Hue" underneath: the sign-in screen. */
  stacked: { light: stackedOnLight, dark: stackedOnDark, label: "Scorelights for Philips Hue" },
};

/**
 * The Scorelights logo from `brand/logo`, in the version for the current colour scheme.
 * `size` is its height in pixels.
 */
export function Logo({ variant = "horizontal", size = 36 }: { variant?: keyof typeof LOCKUPS; size?: number }) {
  const lockup = LOCKUPS[variant];
  const props = { h: size, w: "auto", fit: "contain" as const, style: { flexShrink: 0 } };
  return (
    <>
      <Image src={lockup.light} alt={lockup.label} darkHidden {...props} />
      <Image src={lockup.dark} alt={lockup.label} lightHidden {...props} />
    </>
  );
}
