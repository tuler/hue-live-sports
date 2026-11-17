import { Button, Center, Paper, Text, Title } from "@mantine/core";
import { Logo } from "./Logo.tsx";

/** The first screen: what this does, and the button that starts Hue sign-in. */
export function SignedOut() {
  return (
    <Paper withBorder radius="lg" p={{ base: "lg", sm: 48 }} ta="center">
      <Center mb="lg">
        <Logo size={56} />
      </Center>
      <Title order={2} mb="xs">
        Make your living room part of the game
      </Title>
      <Text c="dimmed" maw={440} mx="auto" mb="xl">
        Connect your Philips Hue Bridge and pick the game you're watching. Every touchdown, goal and win flashes the room you choose in the scoring team's colours, live.
      </Text>
      <Button component="a" href="/auth/start" size="lg">
        Connect Hue
      </Button>
      <Text c="dimmed" size="sm" mt="lg">
        You sign in on Philips Hue's own site. We never see your password.
      </Text>
    </Paper>
  );
}
