import { Badge, Burger, Group, Menu, Title, useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { LogOut, Moon, Router, Sun, Unlink } from "lucide-react";
import { useState } from "react";
import { api, type Me } from "../api.ts";
import { errorMessage } from "../load.ts";
import { Logo } from "./Logo.tsx";

const ICON = { size: 16, "aria-hidden": true } as const;

/** The bridge's short id, which is also the account. */
function BridgeBadge({ id, visibleFrom }: { id: string; visibleFrom?: "xs" }) {
  return (
    <Badge
      variant="light"
      color="gray"
      size="lg"
      radius="sm"
      visibleFrom={visibleFrom}
      leftSection={<Router size={14} aria-hidden />}
      aria-label={`Bridge ${id}`}
      title="Your Hue Bridge"
    >
      {id}
    </Badge>
  );
}

/** Title bar with a menu for light or dark. Signed in, it also shows the bridge and lets you sign out or disconnect. */
export function Header({ me }: { me: Me | null }) {
  const [opened, setOpened] = useState(false);
  const { setColorScheme } = useMantineColorScheme();
  const dark = useComputedColorScheme("light") === "dark";
  const bridge = me?.bridge.slice(-6).toUpperCase();
  const disconnect = async () => {
    if (!confirm("Disconnect this bridge? Your lights stop flashing and your settings are deleted.")) return;
    await api.disconnect().catch((err) => notifications.show({ color: "red", title: "Could not disconnect", message: errorMessage(err) }));
    location.href = "/";
  };
  return (
    <Group justify="space-between" mb="xl" wrap="nowrap">
      <Title order={1} aria-label="Hue Live Sports">
        <Logo />
      </Title>
      <Group gap="sm" wrap="nowrap">
        {bridge && <BridgeBadge id={bridge} visibleFrom="xs" />}
        <Menu position="bottom-end" width={220} opened={opened} onChange={setOpened}>
          <Menu.Target>
            <Burger opened={opened} size="sm" aria-label="Menu" />
          </Menu.Target>
          <Menu.Dropdown>
            {bridge && (
              <>
                <Menu.Label>
                  <BridgeBadge id={bridge} />
                </Menu.Label>
                <Menu.Item leftSection={<LogOut {...ICON} />} onClick={() => api.signOut().then(() => (location.href = "/"))}>
                  Sign out
                </Menu.Item>
                <Menu.Divider />
              </>
            )}
            <Menu.Item leftSection={dark ? <Sun {...ICON} /> : <Moon {...ICON} />} onClick={() => setColorScheme(dark ? "light" : "dark")}>
              {dark ? "Light mode" : "Dark mode"}
            </Menu.Item>
            {bridge && (
              <>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<Unlink {...ICON} />} onClick={disconnect}>
                  Disconnect this bridge
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
