import { Accordion, Alert, Box, Button, Container, Group, MultiSelect, NumberInput, Select, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { api, type Group as LightGroup, type Me, type Settings, type Team } from "../api.ts";
import { testEffect } from "../effects.ts";
import { errorMessage, type Load } from "../load.ts";
import { Advanced } from "./Advanced.tsx";
import { Section } from "./Section.tsx";
import { Swatches } from "./Swatches.tsx";

/** The signed-in screen: room, teams and delay up front, everything else under Advanced. */
const initialSettings = (me: Me): Settings => structuredClone(me.settings ?? { ...me.defaults, group: "" });

export function SettingsScreen({ me }: { me: Me }) {
  const [settings, setSettings] = useState<Settings>(() => initialSettings(me));
  const [saved, setSaved] = useState<string>(() => (me.settings ? JSON.stringify(me.settings) : ""));
  /** Kept apart from `settings.teams` so choosing "every team" and back keeps the picks. */
  const [everyTeam, setEveryTeam] = useState(() => (me.settings?.teams.length ?? 0) === 0);
  const [groups, setGroups] = useState<Load<LightGroup[]>>({ state: "loading" });
  const [teams, setTeams] = useState<Load<Team[]>>({ state: "loading" });
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  const sport = me.leagues.find((l) => l.id === settings.league)?.sport ?? "other";

  useEffect(() => {
    api
      .groups()
      .then((value) => {
        setGroups({ state: "ready", value });
        setSettings((s) => (value.some((g) => g.name === s.group) || !value[0] ? s : { ...s, group: value[0].name }));
      })
      .catch((err) => setGroups({ state: "error", message: errorMessage(err) }));
  }, []);

  useEffect(() => {
    setTeams({ state: "loading" });
    let current = true;
    api
      .teams(settings.league)
      .then((value) => current && setTeams({ state: "ready", value }))
      .catch((err) => current && setTeams({ state: "error", message: errorMessage(err) }));
    return () => {
      current = false;
    };
  }, [settings.league]);

  const body = (): Settings => ({ ...settings, teams: everyTeam ? [] : settings.teams });
  const dirty = JSON.stringify(body()) !== saved;
  const teamList = teams.state === "ready" ? teams.value : [];
  const byAbbr = new Map(teamList.map((t) => [t.abbreviation, t]));

  const save = async (quiet = false): Promise<boolean> => {
    if (!everyTeam && settings.teams.length === 0) {
      notifications.show({ color: "red", message: "Pick at least one team, or follow every team." });
      return false;
    }
    if (!settings.group) {
      notifications.show({ color: "red", message: "Pick the room or zone to flash." });
      return false;
    }
    setBusy("save");
    try {
      const { settings: stored } = await api.save(body());
      setSettings((s) => ({ ...s, effects: stored.effects }));
      setSaved(JSON.stringify(stored));
      if (!quiet) notifications.show({ color: "green", message: "Saved. Your lights are watching." });
      return true;
    } catch (err) {
      notifications.show({ color: "red", title: "Could not save", message: errorMessage(err) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    const effect = testEffect(sport, settings.effects);
    const team = everyTeam ? teamList[0] : byAbbr.get(settings.teams[0] ?? "");
    if (!effect || !team) {
      notifications.show({ color: "red", message: "Turn on at least one effect and pick a team first." });
      return;
    }
    if (dirty && !(await save(true))) return;
    setBusy("test");
    try {
      await api.test(effect, team);
      notifications.show({ color: "green", message: `Flashed ${settings.group} in ${team.name} colours.` });
    } catch (err) {
      notifications.show({ color: "red", title: "Could not flash", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack gap="md" pb={96}>
      {!me.settings && (
        <Alert color="orange" variant="light" title="Almost there">
          Pick your room and teams, then save.
        </Alert>
      )}

      <Section title="Your lights" description="The room or zone that flashes.">
        {groups.state === "error" ? (
          <Alert color="red">Could not reach your bridge through Hue: {groups.message}</Alert>
        ) : (
          <Select
            size="md"
            placeholder={groups.state === "loading" ? "Loading rooms…" : "Pick a room"}
            data={
              groups.state === "ready"
                ? groups.value.map((g) => ({ value: g.name, label: g.kind === "zone" ? `${g.name} (zone)` : g.name }))
                : []
            }
            value={settings.group || null}
            onChange={(v) => v && setSettings({ ...settings, group: v })}
            allowDeselect={false}
            aria-label="Room or zone"
          />
        )}
      </Section>

      <Section title="Your teams" description="Every play in their games flashes, in the scoring team's colours.">
        <Stack gap="md">
          <Select
            size="md"
            label="League"
            data={me.leagues.map((l) => ({ value: l.id, label: l.name }))}
            value={settings.league}
            onChange={(v) => v && v !== settings.league && setSettings({ ...settings, league: v, teams: [] })}
            allowDeselect={false}
            searchable
          />
          <Switch
            size="md"
            label="Follow every team in the league"
            checked={everyTeam}
            onChange={(e) => setEveryTeam(e.currentTarget.checked)}
          />
          {!everyTeam &&
            (teams.state === "error" ? (
              <Alert color="red">Could not load the teams: {teams.message}</Alert>
            ) : (
              <MultiSelect
                size="md"
                label="Teams"
                placeholder={teams.state === "loading" ? "Loading teams…" : settings.teams.length ? "" : "Search and pick your teams"}
                data={teamList.map((t) => ({ value: t.abbreviation, label: t.name }))}
                value={settings.teams}
                onChange={(teams) => setSettings({ ...settings, teams })}
                searchable
                selectFirstOptionOnChange
                hidePickedOptions
                nothingFoundMessage="No team by that name"
                renderOption={({ option }) => (
                  <Group gap="sm" wrap="nowrap">
                    <Swatches colors={byAbbr.get(option.value)?.colors ?? []} />
                    <Text size="sm">{option.label}</Text>
                  </Group>
                )}
              />
            ))}
        </Stack>
      </Section>

      <Section title="TV delay" description="Streams run behind the live feed. Hold flashes back so they don't spoil the play.">
        <NumberInput
          size="md"
          value={settings.delaySeconds}
          onChange={(v) => setSettings({ ...settings, delaySeconds: Math.max(0, Math.min(600, Number(v) || 0)) })}
          min={0}
          max={600}
          suffix=" seconds"
          maw={200}
          aria-label="TV delay in seconds"
        />
      </Section>

      <Accordion variant="separated" radius="lg">
        <Accordion.Item value="advanced">
          <Accordion.Control>
            <Text fw={600}>Advanced</Text>
            <Text c="dimmed" size="sm">
              Effects and how the bridge flashes
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Advanced settings={settings} sport={sport} onChange={setSettings} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Box
        pos="fixed"
        bottom={0}
        left={0}
        right={0}
        py="md"
        style={{
          background: "linear-gradient(transparent, var(--mantine-color-body) 35%)",
          zIndex: 10,
        }}
      >
        <Container size={640} px="md">
          <Group justify="space-between">
            <Button variant="default" size="md" onClick={test} loading={busy === "test"} disabled={busy === "save"}>
              Test flash
            </Button>
            <Button size="md" onClick={() => save()} loading={busy === "save"} disabled={!dirty || busy === "test"}>
              {dirty ? "Save" : "Saved"}
            </Button>
          </Group>
        </Container>
      </Box>
    </Stack>
  );
}
