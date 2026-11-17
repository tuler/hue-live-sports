/**
 * One user: their settings, their Hue Remote API tokens and app key, and the
 * queue of effects waiting out their TV delay. Events arrive from the league's
 * Games object; an alarm plays each effect when it is due.
 *
 * A Durable Object handles one request at a time around storage, so only one
 * token refresh can be in flight, which the single-use refresh token needs.
 */
import { DurableObject } from "cloudflare:workers";
import { parseSettings, effectFor, type Settings } from "../config.ts";
import { colorsFor, play } from "../effects.ts";
import { resolveLeague, type TeamSide } from "../espn.ts";
import type { SportsEvent } from "../events.ts";
import { HueBridge, type LightGroup } from "../hue.ts";
import { HueRemoteAuth, remoteTransport, type RemoteTokens, type TokenStore } from "../hue-remote.ts";
import { findNflTeam, NFL_LEAGUE } from "../nfl.ts";
import { isLate, planEffects, type PlannedEffect } from "../plan.ts";
import type { Env } from "./env.ts";

interface Profile {
  id: string;
  settings: Settings;
}

/** A sign-in link handed out by an admin, valid once. */
interface PendingAuth {
  nonce: string;
  expiresAt: number;
}

const AUTH_LINK_MS = 60 * 60 * 1000;

export class User extends DurableObject<Env> {
  private queue?: PlannedEffect[];
  private group?: LightGroup;

  private get store(): TokenStore {
    return {
      load: () => this.ctx.storage.get<RemoteTokens>("tokens"),
      save: (tokens) => this.ctx.storage.put("tokens", tokens),
    };
  }

  private auth(): HueRemoteAuth {
    return new HueRemoteAuth({ clientId: this.env.HUE_CLIENT_ID, clientSecret: this.env.HUE_CLIENT_SECRET, store: this.store });
  }

  private async bridge(): Promise<HueBridge> {
    const appKey = await this.ctx.storage.get<string>("appKey");
    if (!appKey) throw new Error("No Hue app key yet: finish signing in.");
    return new HueBridge(remoteTransport(this.auth(), { appKey }));
  }

  private async profile(): Promise<Profile> {
    const profile = await this.ctx.storage.get<Profile>("profile");
    if (!profile) throw new Error("User is not configured.");
    return profile;
  }

  private async loadQueue(): Promise<PlannedEffect[]> {
    this.queue ??= (await this.ctx.storage.get<PlannedEffect[]>("queue")) ?? [];
    return this.queue;
  }

  private async saveQueue(queue: PlannedEffect[]): Promise<void> {
    this.queue = queue;
    await this.ctx.storage.put("queue", queue);
    const next = queue[0]?.dueAt;
    if (next === undefined) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  /** Saves settings and subscribes to the league. Returns a one-time sign-in link path. */
  async configure(id: string, raw: unknown): Promise<{ settings: Settings; authPath: string }> {
    const settings = parseSettings(raw);
    const league = resolveLeague(settings.league);
    const old = await this.ctx.storage.get<Profile>("profile");
    if (old && resolveLeague(old.settings.league) !== league) {
      await this.env.GAMES.getByName(resolveLeague(old.settings.league)).unsubscribe(id);
    }
    await this.ctx.storage.put<Profile>("profile", { id, settings });
    this.group = undefined;
    await this.env.GAMES.getByName(league).subscribe(id);
    await this.env.FEEDER.getByName(league).start(league);
    return { settings, authPath: await this.authLink(id) };
  }

  async authLink(id: string): Promise<string> {
    const nonce = crypto.randomUUID();
    await this.ctx.storage.put<PendingAuth>("pendingAuth", { nonce, expiresAt: Date.now() + AUTH_LINK_MS });
    return `/auth/start?user=${encodeURIComponent(id)}&nonce=${nonce}`;
  }

  private async checkNonce(nonce: string): Promise<void> {
    const pending = await this.ctx.storage.get<PendingAuth>("pendingAuth");
    if (!pending || pending.nonce !== nonce || pending.expiresAt < Date.now()) {
      throw new Error("This sign-in link has expired or was already used. Ask for a new one.");
    }
  }

  /** Where to send the user's browser to grant access. */
  async authStart(id: string, nonce: string): Promise<string> {
    await this.checkNonce(nonce);
    return this.auth().authorizeUrl(`${id}.${nonce}`);
  }

  /** Finishes sign-in: trades the code for tokens and makes an app key if there is none. */
  async authCallback(nonce: string, code: string): Promise<LightGroup[]> {
    await this.checkNonce(nonce);
    await this.auth().exchangeCode(code);
    // Only now: if the exchange failed, the same link can be tried again.
    await this.ctx.storage.delete("pendingAuth");
    if (!(await this.ctx.storage.get<string>("appKey"))) {
      const setup = new HueBridge(remoteTransport(this.auth()));
      await setup.pressLinkButton();
      await this.ctx.storage.put("appKey", await setup.pair("hue-live-sports#cloud"));
    }
    return (await this.bridge()).groups();
  }

  /** For development: hand over tokens made by the CLI's `remote-auth`. The CLI must stop using them. */
  async importTokens(tokens: RemoteTokens, appKey: string): Promise<void> {
    await this.ctx.storage.put("tokens", tokens);
    await this.ctx.storage.put("appKey", appKey);
  }

  /** Queues the effects this user wants for `events`. Called by the league's Games object. */
  async deliver(events: SportsEvent[]): Promise<number> {
    const { settings } = await this.profile();
    const planned = planEffects(events, settings, Date.now());
    if (planned.length === 0) return 0;
    const queue = [...(await this.loadQueue()), ...planned].sort((a, b) => a.dueAt - b.dueAt);
    await this.saveQueue(queue);
    return planned.length;
  }

  /** Plays everything due, one at a time, then waits for the next. */
  override async alarm(): Promise<void> {
    const { settings } = await this.profile();
    for (;;) {
      const queue = await this.loadQueue();
      const next = queue[0];
      if (!next) break;
      if (next.dueAt > Date.now()) break;
      await this.saveQueue(queue.slice(1));
      if (isLate(next.dueAt, Date.now())) {
        console.log(`Skipped a late effect: ${next.label}`);
        continue;
      }
      try {
        await play({ bridge: await this.bridge(), group: await this.lightGroup(settings) }, settings.effectMode, next.effect, next.colors);
      } catch (err) {
        console.error(`Effect failed (${next.label}):`, err instanceof Error ? err.message : err);
      }
    }
    await this.saveQueue(await this.loadQueue());
  }

  private async lightGroup(settings: Settings): Promise<LightGroup> {
    this.group ??= await (await this.bridge()).findGroup(settings.group);
    return this.group;
  }

  /** Plays one effect now in `team`'s colours, to check the whole route. */
  async test(effectKey: string, team: string): Promise<string> {
    const { settings } = await this.profile();
    const effect = effectFor(settings, [effectKey]);
    if (!effect) throw new Error(`Effect "${effectKey}" is unknown or disabled.`);
    const league = resolveLeague(settings.league);
    const abbreviation = league === NFL_LEAGUE ? (findNflTeam(team)?.abbr ?? team) : team;
    const side = { abbreviation } as TeamSide;
    const group = await this.lightGroup(settings);
    await play({ bridge: await this.bridge(), group }, settings.effectMode, effect, colorsFor(side, effect, league));
    return `Played "${effectKey}" on ${group.name} for ${effect.seconds}s`;
  }

  async status() {
    const profile = await this.ctx.storage.get<Profile>("profile");
    const tokens = await this.ctx.storage.get<RemoteTokens>("tokens");
    return {
      profile,
      signedIn: Boolean(tokens),
      accessTokenExpiresAt: tokens ? new Date(tokens.expiresAt).toISOString() : undefined,
      hasAppKey: Boolean(await this.ctx.storage.get<string>("appKey")),
      queued: (await this.loadQueue()).map((p) => ({ label: p.label, dueAt: new Date(p.dueAt).toISOString() })),
    };
  }
}
