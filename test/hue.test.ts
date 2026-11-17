import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HueBridge } from "../src/hue.ts";
import { localTransport, type LocalBridgeOptions } from "../src/hue-local.ts";

/**
 * A stand-in bridge: HTTPS with a self-signed certificate whose common name
 * is a bridge id, like the real thing. Needs `openssl` to mint the certificate.
 */
const BRIDGE_ID = "001788fffe123456";
const dir = mkdtempSync(join(tmpdir(), "hue-test-"));
const certFile = join(dir, "cert.pem");
const keyFile = join(dir, "key.pem");
const minted = Bun.spawnSync([
  "openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
  "-keyout", keyFile, "-out", certFile, "-days", "1", "-subj", `/CN=${BRIDGE_ID}`,
]).success;

const puts: { path: string; key: string | null; body: any }[] = [];
let linkPressed = false;
let server: ReturnType<typeof Bun.serve> | undefined;
let ip = "";

const light = (id: string, owner: string, extra: object) => ({ id, owner: { rid: owner, rtype: "device" }, ...extra });
const resources: Record<string, object[]> = {
  room: [
    {
      id: "room-1",
      metadata: { name: "Living Room" },
      children: [{ rid: "dev-1", rtype: "device" }, { rid: "dev-2", rtype: "device" }],
      services: [{ rid: "gl-room", rtype: "grouped_light" }],
    },
  ],
  zone: [
    {
      id: "zone-1",
      metadata: { name: "TV" },
      children: [{ rid: "light-2", rtype: "light" }],
      services: [{ rid: "gl-zone", rtype: "grouped_light" }],
    },
  ],
  light: [
    light("light-1", "dev-1", { on: { on: true }, dimming: { brightness: 40 }, color_temperature: { mirek: 366 }, color: { xy: { x: 0.45, y: 0.41 } } }),
    light("light-2", "dev-2", { on: { on: false }, dimming: { brightness: 80 }, color_temperature: { mirek: null }, color: { xy: { x: 0.2, y: 0.1 } } }),
    light("light-3", "dev-9", { on: { on: true } }),
  ],
};

beforeAll(() => {
  if (!minted) return;
  server = Bun.serve({
    port: 0,
    tls: { cert: readFileSync(certFile, "utf8"), key: readFileSync(keyFile, "utf8") },
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (req.method === "POST" && pathname === "/api") {
        return Response.json(
          linkPressed
            ? [{ success: { username: "app-key-1", clientkey: "x" } }]
            : [{ error: { type: 101, address: "", description: "link button not pressed" } }],
        );
      }
      if (req.headers.get("hue-application-key") !== "app-key-1") {
        return Response.json({ errors: [{ description: "unauthorized" }] }, { status: 403 });
      }
      const type = pathname.replace("/clip/v2/resource/", "").split("/")[0] ?? "";
      if (req.method === "GET" && resources[type]) return Response.json({ errors: [], data: resources[type] });
      if (req.method === "PUT") {
        puts.push({ path: pathname, key: req.headers.get("hue-application-key"), body: await req.json() });
        return Response.json({ errors: [], data: [] });
      }
      return new Response("not found", { status: 404 });
    },
  });
  ip = `127.0.0.1:${server.port}`;
});

afterAll(() => {
  server?.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

const local = (options: LocalBridgeOptions) => new HueBridge(localTransport(options));

describe.skipIf(!minted)("HueBridge", () => {
  const bridge = () => local({ ip, appKey: "app-key-1" });

  it("pairs only after the link button is pressed", async () => {
    const fresh = local({ ip });
    await expect(fresh.pair()).rejects.toThrow(/Link button not pressed/);
    linkPressed = true;
    expect(await fresh.pair()).toBe("app-key-1");
  });

  it("lists rooms and zones with their grouped_light ids", async () => {
    expect(await bridge().groups()).toEqual([
      { id: "gl-room", name: "Living Room", kind: "room", children: ["dev-1", "dev-2"] },
      { id: "gl-zone", name: "TV", kind: "zone", children: ["light-2"] },
    ]);
    expect((await bridge().findGroup("living room")).id).toBe("gl-room");
    await expect(bridge().findGroup("Attic")).rejects.toThrow(/Found: Living Room, TV/);
  });

  it("reports HTTP errors from the bridge", async () => {
    await expect(local({ ip, appKey: "wrong" }).groups()).rejects.toThrow(/HTTP 403/);
  });

  it("sends a signaling command", async () => {
    puts.length = 0;
    const group = await bridge().findGroup("TV");
    const red = { x: 0.64, y: 0.33 };
    const blue = { x: 0.15, y: 0.06 };
    await bridge().signal(group, "alternating", 1, [red, blue]);
    await bridge().signal(group, "alternating", 1, [red]);
    expect(puts.map((p) => p.path)).toEqual(Array(2).fill("/clip/v2/resource/grouped_light/gl-zone"));
    expect(puts[0]?.body).toEqual({ signaling: { signal: "alternating", duration: 1000, colors: [{ xy: red }, { xy: blue }] } });
    // One colour cannot alternate, so it degrades to a single-colour flash.
    expect(puts[1]?.body).toEqual({ signaling: { signal: "on_off_color", duration: 1000, colors: [{ xy: red }] } });
  });

  it("pulses a room and restores each light as it was", async () => {
    puts.length = 0;
    const group = await bridge().findGroup("Living Room");
    await bridge().pulse(group, 1, [{ x: 0.64, y: 0.33 }]);
    expect(puts[0]).toMatchObject({
      path: "/clip/v2/resource/grouped_light/gl-room",
      body: { on: { on: true }, color: { xy: { x: 0.64, y: 0.33 } } },
    });
    // light-3 belongs to another room and must be left alone.
    expect(puts.slice(1)).toEqual([
      { path: "/clip/v2/resource/light/light-1", key: "app-key-1", body: { on: { on: true }, dimming: { brightness: 40 }, color_temperature: { mirek: 366 } } },
      { path: "/clip/v2/resource/light/light-2", key: "app-key-1", body: { on: { on: false }, dimming: { brightness: 80 }, color: { xy: { x: 0.2, y: 0.1 } } } },
    ]);
  });

  it("verifies the certificate against a CA file and the bridge id", async () => {
    const verified = local({ ip, appKey: "app-key-1", caFile: certFile, bridgeId: BRIDGE_ID.toUpperCase() });
    expect(await verified.groups()).toHaveLength(2);
    const wrongId = local({ ip, appKey: "app-key-1", caFile: certFile, bridgeId: "ffffffffffffffff" });
    await expect(wrongId.groups()).rejects.toThrow();
  });
});

it.skipIf(!minted)("rejects the self-signed bridge without the tls option", async () => {
  // Guards the premise of HueBridge: plain fetch must not accept this certificate.
  await expect(fetch(`https://${ip}/clip/v2/resource/room`)).rejects.toThrow();
});
