import { ActionIcon, Badge, Group, Menu, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api, type Me } from "../api.ts";
import { errorMessage } from "../load.ts";
import { Logo } from "./Logo.tsx";

/** Title bar. Signed in, it shows the bridge and a menu to sign out or disconnect. */
export function Header({ me }: { me: Me | null }) {
  const disconnect = async () => {
    if (!confirm("Disconnect this bridge? Your lights stop flashing and your settings are deleted.")) return;
    await api.disconnect().catch((err) => notifications.show({ color: "red", title: "Could not disconnect", message: errorMessage(err) }));
    location.href = "/";
  };
  return (
    <Group justify="space-between" mb="xl" wrap="nowrap">
      <Group gap="sm">
        <Logo />
        <Title order={3}>Hue Live Sports</Title>
      </Group>
      {me && (
        <Group gap="xs">
          <Badge variant="light" color="gray" size="lg" radius="sm" visibleFrom="xs">
            Bridge {me.bridge.slice(-6).toUpperCase()}
          </Badge>
          <Menu position="bottom-end" width={220}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Account">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Bridge {me.bridge.slice(-6).toUpperCase()}</Menu.Label>
              <Menu.Item onClick={() => api.signOut().then(() => (location.href = "/"))}>Sign out</Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" onClick={disconnect}>
                Disconnect this bridge
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      )}
    </Group>
  );
}
