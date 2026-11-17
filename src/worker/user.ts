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

  /** Saves settings, subscribes to the league and starts its feeder. */
  async configure(id: string, raw: unknown): Promise<Settings> {
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
    return settings;
  }

  /**
   * Takes over tokens from a Hue sign-in, and makes an app key on the first
   * one by pressing the bridge's link button through the cloud.
   */
  async adopt(tokens: RemoteTokens): Promise<void> {
    await this.ctx.storage.put("tokens", tokens);
    if (!(await this.ctx.storage.get<string>("appKey"))) {
      const setup = new HueBridge(remoteTransport(this.auth()));
      await setup.pressLinkButton();
      await this.ctx.storage.put("appKey", await setup.pair("hue-live-sports#cloud"));
    }
  }

  /** For development: hand over tokens made by the CLI's `remote-auth`. The CLI must stop using them. */
  async importTokens(tokens: RemoteTokens, appKey: string): Promise<void> {
    await this.ctx.storage.put("tokens", tokens);
    await this.ctx.storage.put("appKey", appKey);
  }

  /** What the settings page needs: saved settings, if any. */
  async me(): Promise<{ settings?: Settings; connected: boolean }> {
    const profile = await this.ctx.storage.get<Profile>("profile");
    return { settings: profile?.settings, connected: Boolean(await this.ctx.storage.get<string>("appKey")) };
  }

  async groups(): Promise<{ name: string; kind: string }[]> {
    return (await (await this.bridge()).groups()).map((g) => ({ name: g.name, kind: g.kind }));
  }

  /** Disconnects: leaves the league and forgets everything, tokens included. */
  async remove(): Promise<void> {
    const profile = await this.ctx.storage.get<Profile>("profile");
    if (profile) await this.env.GAMES.getByName(resolveLeague(profile.settings.league)).unsubscribe(profile.id);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.queue = undefined;
    this.group = undefined;
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

  /** Plays one effect now in a team's colours, to check the whole route. */
  async test(effectKey: string, team: Pick<TeamSide, "abbreviation" | "color" | "alternateColor">): Promise<string> {
    const { settings } = await this.profile();
    const effect = effectFor(settings, [effectKey]);
    if (!effect) throw new Error(`Effect "${effectKey}" is unknown or disabled.`);
    const league = resolveLeague(settings.league);
    const abbreviation = league === NFL_LEAGUE ? (findNflTeam(team.abbreviation)?.abbr ?? team.abbreviation) : team.abbreviation;
    const side = { ...team, abbreviation } as TeamSide;
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
