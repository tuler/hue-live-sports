import { describe, expect, it } from "bun:test";
import { HueBridge } from "../src/hue.ts";
import { codeFromRedirect, HueRemoteAuth, remoteTransport, type RemoteTokens, type TokenStore } from "../src/hue-remote.ts";

const BASE = "https://remote.test";
const BASIC = `Basic ${btoa("client-1:secret-1")}`;

interface Call {
  method: string;
  url: string;
  headers: Headers;
  body: string;
}

/** A stand-in for api.meethue.com: OAuth token endpoint plus the /route proxy. */
function fakeRemote() {
  const calls: Call[] = [];
  let issued = 0;
  /** Access tokens the proxy accepts. */
  const valid = new Set<string>();
  const used = new Set<string>();

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ method: init?.method ?? "GET", url: url.toString(), headers, body });

    if (url.pathname === "/v2/oauth2/token") {
      if (headers.get("authorization") !== BASIC) return new Response("bad client", { status: 401 });
      const form = new URLSearchParams(body);
      const grant = form.get("grant_type");
      if (grant === "authorization_code" && form.get("code") !== "code-1") return new Response("bad code", { status: 400 });
      if (grant === "refresh_token") {
        const old = form.get("refresh_token") ?? "";
        if (used.has(old) || !old.startsWith("refresh-")) return new Response("bad refresh", { status: 400 });
        used.add(old);
      }
      issued++;
      valid.add(`access-${issued}`);
      return Response.json({ access_token: `access-${issued}`, refresh_token: `refresh-${issued}`, expires_in: 604800, token_type: "bearer" });
    }

    if (url.pathname.startsWith("/route/")) {
      const token = headers.get("authorization")?.replace("Bearer ", "") ?? "";
      if (!valid.has(token)) return new Response("unauthorized", { status: 401 });
      const path = url.pathname.slice("/route".length);
      if (path === "/api/0/config") return Response.json([{ success: { "/config/linkbutton": true } }]);
      if (path === "/api") return Response.json([{ success: { username: "remote-key", clientkey: "x" } }]);
      if (headers.get("hue-application-key") !== "app-key-1") return new Response("bad key", { status: 403 });
      if (path === "/clip/v2/resource/room") {
        return Response.json({
          errors: [],
          data: [{ id: "room-1", metadata: { name: "Den" }, children: [], services: [{ rid: "gl-1", rtype: "grouped_light" }] }],
        });
      }
      if (path === "/clip/v2/resource/zone") return Response.json({ errors: [], data: [] });
      if (init?.method === "PUT") return Response.json({ errors: [], data: [] });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;

  return { calls, fetchImpl, revoke: (token: string) => valid.delete(token) };
}

function memoryStore(initial?: RemoteTokens): TokenStore & { saved: RemoteTokens[] } {
  let current = initial;
  const saved: RemoteTokens[] = [];
  return {
    saved,
    load: async () => current,
    save: async (t) => {
      current = t;
      saved.push(t);
    },
  };
}

function setup(initial?: RemoteTokens, now = 1_000_000) {
  const remote = fakeRemote();
  const store = memoryStore(initial);
  let clock = now;
  const auth = new HueRemoteAuth({
    clientId: "client-1",
    clientSecret: "secret-1",
    store,
    baseUrl: BASE,
    fetchImpl: remote.fetchImpl,
    now: () => clock,
  });
  const transport = (appKey?: string) => remoteTransport(auth, { appKey, baseUrl: BASE, fetchImpl: remote.fetchImpl });
  return { ...remote, store, auth, transport, tick: (ms: number) => (clock += ms) };
}

describe("Hue Remote API", () => {
  it("builds the authorize link", () => {
    const url = new URL(setup().auth.authorizeUrl("state-1"));
    expect(url.origin + url.pathname).toBe(`${BASE}/v2/oauth2/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: "client-1", response_type: "code", state: "state-1" });
  });

  it("exchanges a code for tokens and saves them", async () => {
    const { auth, store, calls } = setup();
    const tokens = await auth.exchangeCode("code-1");
    expect(tokens).toEqual({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: 1_000_000 + 604800_000 });
    expect(store.saved).toEqual([tokens]);
    expect(calls[0]?.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    await expect(auth.exchangeCode("wrong")).rejects.toThrow(/authorization_code\): HTTP 400/);
  });

  it("refreshes an access token that is about to expire, once for concurrent callers", async () => {
    const { auth, store, calls, tick } = setup();
    await auth.exchangeCode("code-1");
    expect(await auth.accessToken()).toBe("access-1");

    tick(604800_000 - 60_000); // a minute left: inside the refresh margin
    const [a, b] = await Promise.all([auth.accessToken(), auth.accessToken()]);
    expect([a, b]).toEqual(["access-2", "access-2"]);
    expect(calls.filter((c) => c.body.includes("refresh_token"))).toHaveLength(1);
    expect(store.saved.at(-1)?.refreshToken).toBe("refresh-2");
  });

  it("asks for remote-auth when there are no tokens", async () => {
    await expect(setup().auth.accessToken()).rejects.toThrow(/remote-auth/);
  });

  it("sends CLIP v2 calls through /route with the token and app key", async () => {
    const { auth, transport, calls } = setup();
    await auth.exchangeCode("code-1");
    const hue = new HueBridge(transport("app-key-1"));
    const group = await hue.findGroup("den");
    await hue.signal(group, "on_off_color", 0, [{ x: 0.15, y: 0.06 }]);

    const put = calls.at(-1);
    expect(put?.url).toBe(`${BASE}/route/clip/v2/resource/grouped_light/gl-1`);
    expect(put?.headers.get("authorization")).toBe("Bearer access-1");
    expect(put?.headers.get("hue-application-key")).toBe("app-key-1");
    expect(JSON.parse(put?.body ?? "")).toEqual({
      signaling: { signal: "on_off_color", duration: 1000, colors: [{ xy: { x: 0.15, y: 0.06 } }] },
    });
  });

  it("retries once with a fresh token after a 401", async () => {
    const { auth, transport, revoke } = setup();
    await auth.exchangeCode("code-1");
    revoke("access-1");
    expect(await new HueBridge(transport("app-key-1")).groups()).toHaveLength(1);
  });

  it("reports a refused app key with the route's name", async () => {
    const { auth, transport } = setup();
    await auth.exchangeCode("code-1");
    await expect(new HueBridge(transport("wrong")).groups()).rejects.toThrow(/^Hue Remote API GET .*HTTP 403/);
  });

  it("creates an app key remotely by pressing the link button", async () => {
    const { auth, transport, calls } = setup();
    await auth.exchangeCode("code-1");
    const hue = new HueBridge(transport());
    await hue.pressLinkButton();
    expect(await hue.pair("hue-live-sports#remote")).toBe("remote-key");
    expect(calls.slice(-2).map((c) => [c.method, new URL(c.url).pathname])).toEqual([
      ["PUT", "/route/api/0/config"],
      ["POST", "/route/api"],
    ]);
  });
});

describe("codeFromRedirect", () => {
  it("takes the code from a redirect URL whose state matches", () => {
    expect(codeFromRedirect(" https://cb.example/?code=abc&state=s1 ", "s1")).toBe("abc");
    expect(() => codeFromRedirect("https://cb.example/?code=abc&state=other", "s1")).toThrow(/state/);
    expect(() => codeFromRedirect("https://cb.example/?error=access_denied&state=s1", "s1")).toThrow(/access_denied/);
  });

  it("accepts a bare code", () => {
    expect(codeFromRedirect("abc\n", "s1")).toBe("abc");
    expect(() => codeFromRedirect("  ", "s1")).toThrow(/Nothing/);
  });
});

describe("default fetch", () => {
  it("calls the global fetch with no `this`, as Workers require", async () => {
    const original = globalThis.fetch;
    let receiver: unknown = "not called";
    globalThis.fetch = function (this: unknown) {
      receiver = this;
      return Promise.resolve(Response.json({ access_token: "a", refresh_token: "r", expires_in: 60 }));
    } as unknown as typeof fetch;
    try {
      const auth = new HueRemoteAuth({ clientId: "c", clientSecret: "s", store: memoryStore() });
      await auth.exchangeCode("code");
      expect(receiver === undefined || receiver === globalThis).toBe(true);
      await new HueBridge(remoteTransport(auth, { appKey: "k" })).groups().catch(() => {});
      expect(receiver === undefined || receiver === globalThis).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});
