import { Box, Group, Radio, SimpleGrid, Stack, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import type { League } from "../api.ts";
import { LeagueLogo } from "./LeagueLogo.tsx";

interface Props {
  leagues: League[];
  value: string;
  onChange: (league: string) => void;
  label: string;
}

/**
 * Every league as a card with its logo: one tap to see its games. A grid where there is room; on phones
 * a row that scrolls sideways, so the games stay in view below it.
 */
export function LeaguePicker({ leagues, value, onChange, label }: Props) {
  const theme = useMantineTheme();
  const phone = useMediaQuery(`(max-width: ${parseFloat(theme.breakpoints.xs) - 0.01}em)`, undefined, {
    getInitialValueInEffect: false,
  });
  const row = useRef<HTMLDivElement>(null);

  // Keep the picked league in view in the row, even when it is far along (or set before the row existed).
  useEffect(() => {
    const strip = row.current;
    const card = strip?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!strip || !card) return;
    const left = card.offsetLeft - strip.offsetLeft;
    const visible = left >= strip.scrollLeft && left + card.offsetWidth <= strip.scrollLeft + strip.clientWidth;
    if (!visible) strip.scrollTo({ left: left - (strip.clientWidth - card.offsetWidth) / 2 });
  }, [value, phone]);

  const cards = leagues.map((l) => {
    const checked = l.id === value;
    return (
      <Radio.Card
        key={l.id}
        value={l.id}
        radius="md"
        p="xs"
        w={phone ? 84 : undefined}
        style={{
          flexShrink: 0,
          scrollSnapAlign: "start",
          borderColor: checked ? "var(--mantine-primary-color-filled)" : undefined,
          background: checked ? "var(--mantine-primary-color-light)" : undefined,
        }}
      >
        {/* Buttons centre their content vertically; pin it to the top so logos line up across a row. */}
        <Stack gap={6} align="center" justify="flex-start" h="100%">
          <LeagueLogo logo={l.logo} size={36} />
          <Text size="xs" fw={checked ? 600 : 500} ta="center" lh={1.2} lineClamp={2}>
            {l.name}
          </Text>
        </Stack>
      </Radio.Card>
    );
  });

  return (
    <Radio.Group value={value} onChange={onChange} label={label} labelProps={{ mb: "xs" }}>
      {phone ? (
        // Bleeds to the section's edges, so a card cut off at the right shows the row scrolls.
        <Box
          ref={row}
          mx="calc(var(--mantine-spacing-lg) * -1)"
          px="lg"
          style={{
            overflowX: "auto",
            scrollbarWidth: "none",
            scrollSnapType: "x proximity",
            scrollPaddingInline: "var(--mantine-spacing-lg)",
          }}
        >
          <Group gap="xs" wrap="nowrap" align="stretch" w="max-content">
            {cards}
          </Group>
        </Box>
      ) : (
        <SimpleGrid cols={{ base: 4, xs: 5, sm: 7 }} spacing="xs" verticalSpacing="xs">
          {cards}
        </SimpleGrid>
      )}
    </Radio.Group>
  );
}
