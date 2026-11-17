/**
 * Cloudflare Worker entry. Data flows the same way as locally:
 * score sources -> Games (one per league: tracker) -> User (one per person:
 * filter, delay, Hue Remote API).
 *
 *   POST /webhook/<league>         signed score updates (the ESPN feeder posts here too)
 *   GET  /auth/start, /auth/callback   Hue sign-in for a user, from a link an admin made
 *   PUT  /users/<id>               admin: save settings, subscribe, start the league's feeder
 *   GET  /users/<id>               admin: user status
 *   POST /users/<id>/auth-link     admin: a fresh sign-in link
 *   PUT  /users/<id>/tokens        admin, development: import the CLI's tokens and app key
 *   POST /users/<id>/test          admin: play one effect now, { "effect", "team" }
 *   GET  /leagues/<league>         admin: tracked games, subscribers and feeder state
 */
import { resolveLeague } from "../espn.ts";
import type { RemoteTokens } from "../hue-remote.ts";
import type { Env } from "./env.ts";
import { WEBHOOK_PATH } from "./games.ts";

export { Feeder } from "./feeder.ts";
export { Games } from "./games.ts";
export { User } from "./user.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (status: number, error: string) => json({ error }, status);

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function league(raw: string): string {
  try {
    return resolveLeague(decodeURIComponent(raw));
  } catch (err) {
    throw new HttpError(404, err instanceof Error ? err.message : "unknown league");
  }
}

function requireAdmin(req: Request, env: Env): void {
  const given = req.headers.get("authorization") ?? "";
  if (!env.ADMIN_TOKEN || given !== `Bearer ${env.ADMIN_TOKEN}`) throw new HttpError(401, "admin token required");
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "body is not JSON");
  }
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  const hook = /^\/webhook\/(.+)$/.exec(path);
  if (hook) {
    const name = league(hook[1]!);
    const target = `https://games${WEBHOOK_PATH}?league=${encodeURIComponent(name)}`;
    return env.GAMES.getByName(name).fetch(new Request(target, req));
  }

  if (path === "/auth/start") {
    const id = url.searchParams.get("user") ?? "";
    const nonce = url.searchParams.get("nonce") ?? "";
    return Response.redirect(await env.USER.getByName(id).authStart(id, nonce), 302);
  }

  if (path === "/auth/callback") {
    const [id = "", nonce = ""] = (url.searchParams.get("state") ?? "").split(".");
    const code = url.searchParams.get("code");
    if (!code) throw new HttpError(400, `Hue did not authorize: ${url.searchParams.get("error") ?? "no code"}`);
    const groups = await env.USER.getByName(id).authCallback(nonce, code);
    return new Response(`Connected. Rooms and zones on your bridge: ${groups.map((g) => g.name).join(", ")}\n`);
  }

  const user = /^\/users\/([A-Za-z0-9_-]{1,64})(\/[a-z-]+)?$/.exec(path);
  if (user) {
    requireAdmin(req, env);
    const id = user[1]!;
    const stub = env.USER.getByName(id);
    const action = `${req.method} ${user[2] ?? ""}`;
    switch (action) {
      case "PUT ": {
        const { settings, authPath } = await stub.configure(id, await body(req));
        return json({ settings, authLink: new URL(authPath, url).toString() });
      }
      case "GET ":
        return json(await stub.status());
      case "POST /auth-link":
        return json({ authLink: new URL(await stub.authLink(id), url).toString() });
      case "PUT /tokens": {
        const b = await body(req);
        if (typeof b.appKey !== "string" || typeof b.tokens !== "object") throw new HttpError(400, 'need { "tokens", "appKey" }');
        await stub.importTokens(b.tokens as RemoteTokens, b.appKey);
        return json({ ok: true });
      }
      case "POST /test": {
        const b = await body(req);
        return json({ result: await stub.test(String(b.effect ?? "touchdown"), String(b.team ?? "")) });
      }
    }
  }

  const leaguePath = /^\/leagues\/(.+)$/.exec(path);
  if (leaguePath && req.method === "GET") {
    requireAdmin(req, env);
    const name = league(leaguePath[1]!);
    const [games, feeder] = await Promise.all([env.GAMES.getByName(name).status(), env.FEEDER.getByName(name).status()]);
    return json({ league: name, ...games, feeder });
  }

  return fail(404, "not found");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      return fail(500, message);
    }
  },
} satisfies ExportedHandler<Env>;
