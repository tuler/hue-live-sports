import { Box, Image } from "@mantine/core";
import type { League } from "../api.ts";

/**
 * A league's logo, swapped for its dark-background version in dark mode. Decorative: the league's
 * name is always next to it. A league without a logo keeps the same space so names line up.
 */
export function LeagueLogo({ logo, size = 20 }: { logo?: League["logo"]; size?: number }) {
  if (!logo) return <Box w={size} h={size} style={{ flexShrink: 0 }} />;
  const props = { w: size, h: size, fit: "contain", alt: "", style: { flexShrink: 0 } } as const;
  return (
    <>
      <Image src={logo.light} darkHidden {...props} />
      <Image src={logo.dark} lightHidden {...props} />
    </>
  );
}
