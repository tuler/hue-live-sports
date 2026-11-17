/**
 * Minimal client for the Hue CLIP v2 API.
 * https://developers.meethue.com/develop/hue-api-v2/
 *
 * The same calls work on the bridge's local API and through Hue's Remote API;
 * a `HueTransport` (`hue-local.ts`, `hue-remote.ts`) says how requests get
 * there. This file uses only `fetch`-era globals so it can run in a Worker.
 */
import type { XY } from "./color.ts";

/** Sends one request to the bridge, by whatever route. */
export interface HueTransport {
  /** Names the route in error messages, e.g. "Hue bridge". */
  readonly label: string;
  send(method: string, path: string, body?: string): Promise<Response>;
}

export interface LightGroup {
  /** The `grouped_light` resource id that commands are sent to. */
  id: string;
  name: string;
  kind: "room" | "zone";
  /** Ids of the room's devices or the zone's lights. */
  children: string[];
}

export type Signal = "on_off_color" | "alternating";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type V1Reply = { success?: Record<string, unknown>; error?: { type: number; description: string } }[];

interface LightState {
  id: string;
  body: Record<string, unknown>;
}

interface Resource {
  id: string;
  metadata?: { name?: string };
  services?: { rid: string; rtype: string }[];
  children?: { rid: string; rtype: string }[];
  owner?: { rid: string };
  on?: { on: boolean };
  dimming?: { brightness: number };
  color?: { xy: XY };
  color_temperature?: { mirek: number | null };
}

export class HueBridge {
  constructor(private readonly transport: HueTransport) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.transport.send(method, path, body === undefined ? undefined : JSON.stringify(body));
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${this.transport.label} ${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    return JSON.parse(text) as T;
  }

  private async resources(type: string): Promise<Resource[]> {
    return (await this.request<{ data: Resource[] }>("GET", `/clip/v2/resource/${type}`)).data;
  }

  /**
   * Creates an app key. The bridge's link button must have been pressed in the
   * last 30 s, physically or with `pressLinkButton` through the Remote API.
   */
  async pair(deviceType = "scorelights#cli"): Promise<string> {
    const reply = await this.request<V1Reply>("POST", "/api", { devicetype: deviceType, generateclientkey: true });
    const first = reply[0];
    const username = first?.success?.username;
    if (typeof username === "string") return username;
    if (first?.error?.type === 101) {
      throw new Error("Link button not pressed. Press the button on the bridge, then run pair again within 30 seconds.");
    }
    throw new Error(`Pairing failed: ${first?.error?.description ?? JSON.stringify(reply)}`);
  }

  /**
   * Presses the link button virtually. Only the Remote API accepts this, since
   * the OAuth grant already proves the user owns the bridge.
   */
  async pressLinkButton(): Promise<void> {
    const reply = await this.request<V1Reply>("PUT", "/api/0/config", { linkbutton: true });
    if (!reply[0]?.success) throw new Error(`Could not press the link button: ${JSON.stringify(reply)}`);
  }

  async groups(): Promise<LightGroup[]> {
    const groups: LightGroup[] = [];
    for (const kind of ["room", "zone"] as const) {
      for (const r of await this.resources(kind)) {
        const service = r.services?.find((s) => s.rtype === "grouped_light");
        if (!service) continue;
        groups.push({
          id: service.rid,
          name: r.metadata?.name ?? r.id,
          kind,
          children: (r.children ?? []).map((c) => c.rid),
        });
      }
    }
    return groups;
  }

  async findGroup(name: string): Promise<LightGroup> {
    const groups = await this.groups();
    const group = groups.find((g) => g.name.toLowerCase() === name.trim().toLowerCase());
    if (!group) {
      throw new Error(`No room or zone named "${name}". Found: ${groups.map((g) => g.name).join(", ") || "none"}`);
    }
    return group;
  }

  /**
   * Flash a group using the bridge's own signaling effect. The bridge runs the
   * timing and puts the lights back afterwards, so this is a single request.
   */
  async signal(group: LightGroup, signal: Signal, seconds: number, colors: XY[]): Promise<void> {
    const two = signal === "alternating" && colors.length >= 2;
    await this.request("PUT", `/clip/v2/resource/grouped_light/${group.id}`, {
      signaling: {
        signal: two ? "alternating" : "on_off_color",
        duration: Math.max(1, Math.round(seconds)) * 1000,
        colors: colors.slice(0, two ? 2 : 1).map((xy) => ({ xy })),
      },
    });
    await sleep(seconds * 1000);
  }

  /**
   * Flash a group by hand: remember each light, pulse the colours once a
   * second, then restore. For lights or firmware where signaling does nothing.
   */
  async pulse(group: LightGroup, seconds: number, colors: XY[]): Promise<void> {
    const saved = await this.snapshot(group);
    try {
      const steps = Math.max(1, Math.round(seconds));
      for (let i = 0; i < steps; i++) {
        const xy = colors[i % colors.length];
        // One command per second: the bridge asks for at most 1/s on groups.
        await this.request("PUT", `/clip/v2/resource/grouped_light/${group.id}`, {
          on: { on: true },
          dimming: { brightness: colors.length === 1 && i % 2 === 1 ? 30 : 100 },
          color: { xy },
          dynamics: { duration: 200 },
        });
        await sleep(1000);
      }
    } finally {
      for (const light of saved) {
        await this.request("PUT", `/clip/v2/resource/light/${light.id}`, light.body).catch((err: unknown) =>
          console.error(`Could not restore light ${light.id}:`, err),
        );
        await sleep(100);
      }
    }
  }

  private async snapshot(group: LightGroup): Promise<LightState[]> {
    const members = new Set(group.children);
    const lights = (await this.resources("light")).filter(
      (l) => members.has(l.id) || (l.owner && members.has(l.owner.rid)),
    );
    return lights.map((l) => {
      const body: Record<string, unknown> = { on: { on: l.on?.on ?? false } };
      if (l.dimming) body.dimming = { brightness: l.dimming.brightness };
      // A light is in either colour-temperature or colour mode; mirek is null in the latter.
      if (l.color_temperature?.mirek) body.color_temperature = { mirek: l.color_temperature.mirek };
      else if (l.color) body.color = { xy: l.color.xy };
      return { id: l.id, body };
    });
  }
}

/** Finds bridges on the local network through Signify's discovery service. */
export async function discoverBridges(): Promise<{ id: string; ip: string }[]> {
  const res = await fetch("https://discovery.meethue.com/", { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Bridge discovery returned HTTP ${res.status}`);
  const list = (await res.json()) as { id: string; internalipaddress: string }[];
  return list.map((b) => ({ id: b.id, ip: b.internalipaddress }));
}
