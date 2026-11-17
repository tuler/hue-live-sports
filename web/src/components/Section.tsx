import { Box, Paper, Text } from "@mantine/core";
import type { ReactNode } from "react";

/** A titled card on the settings screen. */
export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Paper withBorder radius="lg" p="lg">
      <Text fw={600} size="lg">
        {title}
      </Text>
      {description && (
        <Text c="dimmed" size="sm" mb="md">
          {description}
        </Text>
      )}
      {!description && <Box h={8} />}
      {children}
    </Paper>
  );
}
