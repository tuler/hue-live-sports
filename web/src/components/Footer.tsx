import { Anchor, Stack, Text } from "@mantine/core";

/** Small print under every screen: who we are not, what to expect from the scores, and the icon credit CC BY requires. */
export function Footer() {
  return (
    <Stack component="footer" gap={6} mt={48} ta="center">
      <Text size="xs" c="dimmed">
        An independent fan project. Not affiliated with, endorsed or sponsored by Philips Hue, Signify or Philips. Philips and
        Hue are trademarks of Koninklijke Philips N.V. and Signify Holding.
      </Text>
      <Text size="xs" c="dimmed">
        Not affiliated with ESPN or with any league or team. Team names and colours belong to their owners.
      </Text>
      <Text size="xs" c="dimmed">
        Scores are unofficial and can arrive before or after your TV picture.
      </Text>
      <Text size="xs" c="dimmed">
        Football, soccer ball and basketball icons by{" "}
        <Anchor href="https://delapouite.com" inherit c="dimmed" underline="always">
          Delapouite
        </Anchor>
        , from{" "}
        <Anchor href="https://game-icons.net" inherit c="dimmed" underline="always">
          game-icons.net
        </Anchor>
        , licensed under{" "}
        <Anchor href="https://creativecommons.org/licenses/by/3.0/" inherit c="dimmed" underline="always">
          CC BY 3.0
        </Anchor>
        . Colours changed.
      </Text>
    </Stack>
  );
}
