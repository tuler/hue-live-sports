import { ActionIcon, Menu, useMantineColorScheme, type MantineColorScheme } from "@mantine/core";

const CHOICES: { value: MantineColorScheme; label: string }[] = [
  { value: "auto", label: "Match my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Light, dark, or whatever the device uses. Mantine remembers the choice in this browser. */
export function ColorSchemeMenu() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <Menu position="bottom-end" width={200}>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Appearance">
          {/* Half-filled circle: light and dark. */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
          </svg>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Appearance</Menu.Label>
        {CHOICES.map((c) => (
          <Menu.Item
            key={c.value}
            onClick={() => setColorScheme(c.value)}
            aria-checked={colorScheme === c.value}
            role="menuitemradio"
            rightSection={
              colorScheme === c.value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )
            }
          >
            {c.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
