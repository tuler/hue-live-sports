/**
 * Cloudflare Worker entry. Data flows the same way as locally:
 * score sources -> Games (one per league: tracker) -> User (one per bridge:
 * filter, delay, Hue Remote API).
 *
 * Public
 *   GET  /                         the settings page: the React app in web/, served as static assets
 *   GET  /auth/start               sign in with Hue (OAuth); the bridge id becomes the user id
 *   GET  /auth/callback            Hue's redirect back; sets the session cookie
 *   POST /auth/signout
 *   POST /webhook/<league>         signed score updates (the ESPN feeder posts here too)
 *
 * Signed in (session cookie)
 *   GET  /api/me                   settings, defaults and the league list
 *   GET  /api/groups               rooms and zones on the bridge
 *   GET  /api/teams?league=nfl     teams to pick from
 *   PUT  /api/settings             save settings
 *   POST /api/test                 play one effect now, { "effect", "team" }
 *   DELETE /api/me                 disconnect and forget this bridge
 *
 * Admin (Authorization: Bearer $ADMIN_TOKEN)
 *   GET|PUT|DELETE /users/<id>, PUT /users/<id>/tokens, POST /users/<id>/test, GET /leagues/<league>
 */
import { DEFAULT_EFFECTS } from "../config.ts";
import { fetchTeams, LEAGUE_NAMES, LEAGUES, resolveLeague, sportOf } from "../espn.ts";
import { EFFECT_KEYS } from "../events.ts";
import { HueRemoteAuth, type RemoteTokens } from "../hue-remote.ts";
import { fullName, NFL_LEAGUE, NFL_TEAMS } from "../nfl.ts";
import type { Env } from "./env.ts";
import { WEBHOOK_PATH } from "./games.ts";
import {
  checkState,
  clearCookie,
  oauthState,
  sessionCookie,
  sessionUser,
  SESSION_COOKIE,
  STATE_COOKIE,
} from "./session.ts";

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

/** Refuses a state-changing request from another site (the session cookie alone would let it through). */
function sameOrigin(req: Request, url: URL): void {
  if (req.method !== "GET" && req.headers.get("origin") !== url.origin) throw new HttpError(403, "cross-site request");
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

const hueAuth = (env: Env, tokens: { current?: RemoteTokens } = {}) =>
  new HueRemoteAuth({
    clientId: env.HUE_CLIENT_ID,
    clientSecret: env.HUE_CLIENT_SECRET,
    store: { load: async () => tokens.current, save: async (t) => void (tokens.current = t) },
  });

/** The bridge behind a fresh access token, read before any app key exists. */
async function bridgeId(accessToken: string): Promise<string> {
  const res = await fetch("https://api.meethue.com/route/api/config", {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const config = (await res.json().catch(() => ({}))) as { bridgeid?: unknown };
  if (!res.ok || typeof config.bridgeid !== "string" || !/^[0-9A-Fa-f]{16}$/.test(config.bridgeid)) {
    throw new Error(`Could not read the bridge id (HTTP ${res.status}).`);
  }
  return config.bridgeid.toLowerCase();
}

const leagueList = () =>
  Object.entries(LEAGUES).map(([id, path]) => ({ id, name: LEAGUE_NAMES[id] ?? id, sport: sportOf(path) }));

/** Teams to pick from: the built-in table for the NFL (lamp colours), ESPN's list otherwise. */
async function teamsFor(leagueId: string) {
  const path = league(leagueId);
  if (path === NFL_LEAGUE) {
    return NFL_TEAMS.map((t) => ({ abbreviation: t.abbr, name: fullName(t), colors: t.colors.map((c) => `#${c}`) }));
  }
  const teams = await fetchTeams(path);
  return teams.map((t) => ({
    abbreviation: t.abbreviation,
    name: t.name,
    color: t.color,
    alternateColor: t.alternateColor,
    colors: [t.color, t.alternateColor].filter((c): c is string => Boolean(c)).map((c) => `#${c}`),
  }));
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
    const { state, cookie } = await oauthState(env.SESSION_SECRET);
    return redirect(hueAuth(env).authorizeUrl(state), [cookie]);
  }

  if (path === "/auth/callback") {
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code");
    if (!code) return redirect(`/?error=${encodeURIComponent(url.searchParams.get("error") ?? "not authorized")}`);
    if (!(await checkState(req, state, env.SESSION_SECRET))) return redirect("/?error=sign-in+expired%2C+try+again");
    const tokens: { current?: RemoteTokens } = {};
    const signedIn = await hueAuth(env, tokens).exchangeCode(code);
    const id = await bridgeId(signedIn.accessToken);
    await env.USER.getByName(id).adopt(signedIn);
    return redirect("/", [await sessionCookie(id, env.SESSION_SECRET), clearCookie(STATE_COOKIE)]);
  }

  if (path === "/auth/signout" && req.method === "POST") {
    sameOrigin(req, url);
    return redirect("/", [clearCookie(SESSION_COOKIE)]);
  }

  if (path.startsWith("/api/")) {
    sameOrigin(req, url);
    const id = await sessionUser(req, env.SESSION_SECRET);
    if (!id) throw new HttpError(401, "not signed in");
    const user = env.USER.getByName(id);
    const action = `${req.method} ${path}`;
    switch (action) {
      case "GET /api/me":
        return json({
          bridge: id,
          ...(await user.me()),
          leagues: leagueList(),
          effectKeys: EFFECT_KEYS,
          defaults: { league: "nfl", teams: [], delaySeconds: 0, effectMode: "signal", effects: DEFAULT_EFFECTS },
        });
      case "GET /api/groups":
        return json(await user.groups());
      case "GET /api/teams":
        return json(await teamsFor(url.searchParams.get("league") ?? "nfl"));
      case "PUT /api/settings":
        try {
          return json({ settings: await user.configure(id, await body(req)) });
        } catch (err) {
          throw new HttpError(422, err instanceof Error ? err.message : String(err));
        }
      case "POST /api/test": {
        const b = await body(req);
        const team = (b.team ?? {}) as { abbreviation?: unknown; color?: unknown; alternateColor?: unknown };
        const str = (v: unknown) => (typeof v === "string" ? v : undefined);
        return json({
          result: await user.test(String(b.effect ?? "touchdown"), {
            abbreviation: str(team.abbreviation) ?? "",
            color: str(team.color),
            alternateColor: str(team.alternateColor),
          }),
        });
      }
      case "DELETE /api/me": {
        await user.remove();
        const res = json({ ok: true });
        res.headers.append("set-cookie", clearCookie(SESSION_COOKIE));
        return res;
      }
    }
    return fail(404, "not found");
  }

  const admin = /^\/users\/([A-Za-z0-9_-]{1,64})(\/[a-z-]+)?$/.exec(path);
  if (admin) {
    requireAdmin(req, env);
    const id = admin[1]!;
    const stub = env.USER.getByName(id);
    switch (`${req.method} ${admin[2] ?? ""}`) {
      case "PUT ":
        return json({ settings: await stub.configure(id, await body(req)) });
      case "GET ":
        return json(await stub.status());
      case "DELETE ":
        await stub.remove();
        return json({ ok: true });
      case "PUT /tokens": {
        const b = await body(req);
        if (typeof b.appKey !== "string" || typeof b.tokens !== "object") throw new HttpError(400, 'need { "tokens", "appKey" }');
        await stub.importTokens(b.tokens as RemoteTokens, b.appKey);
        return json({ ok: true });
      }
      case "POST /test": {
        const b = await body(req);
        return json({ result: await stub.test(String(b.effect ?? "touchdown"), { abbreviation: String(b.team ?? "") }) });
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
