import { ColorSwatch, Group } from "@mantine/core";

/** A team's one or two colours as overlapping dots. */
export function Swatches({ colors }: { colors: string[] }) {
  return (
    <Group gap={0} wrap="nowrap">
      {colors.slice(0, 2).map((c, i) => (
        <ColorSwatch key={c + i} color={c} size={14} style={{ marginLeft: i ? -4 : 0 }} />
      ))}
    </Group>
  );
}
