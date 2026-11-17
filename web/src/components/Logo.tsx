import { Box } from "@mantine/core";

/** The app's mark: a glowing bulb. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <Box
      w={size}
      h={size}
      style={{
        borderRadius: "50%",
        background: "radial-gradient(circle at 38% 35%, #ffe3c2, var(--mantine-color-orange-6))",
        boxShadow: `0 0 ${Math.round(size * 0.66)}px color-mix(in srgb, var(--mantine-color-orange-6) 58%, transparent)`,
      }}
    />
  );
}
