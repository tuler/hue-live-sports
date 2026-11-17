/**
 * Route to the bridge through Hue's Remote API, so it can be reached from
 * outside the home network. Uses only `fetch` and Web globals so it can run in
 * a Cloudflare Worker; where tokens are kept is up to the `TokenStore`.
 *
 * The flow: the user signs in at `authorizeUrl`, Hue redirects to the app's
 * callback URL with a `code`, and `exchangeCode` trades it for an access token
 * and a refresh token. CLIP v2 calls then go to `/route/clip/v2/...` with both
 * the access token and the bridge's usual app key.
 *
 * Endpoints follow Q42.HueApi and node-hue-api, since Hue's own pages need a
 * developer login. Not yet tried against the real service.
 */
import type { HueTransport } from "./hue.ts";

export const REMOTE_API = "https://api.meethue.com";

/**
 * The global `fetch`, looked up at call time. Workers throw "Illegal
 * invocation" when `fetch` runs with any other `this`, as it would if kept
 * on an object and called as a method.
 */
const globalFetch: FetchLike = (input, init) => fetch(input, init);

/** The part of `fetch` used here; tests pass a fake. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Refresh this long before the access token runs out. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface RemoteTokens {
  accessToken: string;
  refreshToken: string;
  /** When the access token expires (ms since epoch). */
  expiresAt: number;
}

export interface TokenStore {
  load(): Promise<RemoteTokens | undefined>;
  save(tokens: RemoteTokens): Promise<void>;
}

export interface RemoteAuthOptions {
  clientId: string;
  clientSecret: string;
  store: TokenStore;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  now?: () => number;
}

export class HueRemoteAuth {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  /** A refresh in flight: refresh tokens are single use, so callers share one. */
  private refreshing?: Promise<RemoteTokens>;

  constructor(private readonly options: RemoteAuthOptions) {
    this.baseUrl = options.baseUrl ?? REMOTE_API;
    this.fetchImpl = options.fetchImpl ?? globalFetch;
    this.now = options.now ?? Date.now;
  }

  /** Where to send the user to grant access. `state` comes back on the redirect. */
  authorizeUrl(state: string): string {
    const q = new URLSearchParams({ client_id: this.options.clientId, response_type: "code", state });
    return `${this.baseUrl}/v2/oauth2/authorize?${q}`;
  }

  async exchangeCode(code: string): Promise<RemoteTokens> {
    return this.tokenRequest({ grant_type: "authorization_code", code });
  }

  /** A valid access token, refreshed first if it is about to expire. */
  async accessToken(): Promise<string> {
    const tokens = await this.options.store.load();
    if (!tokens) throw new Error("Not authorized with the Hue Remote API yet (see: remote-auth).");
    if (tokens.expiresAt - REFRESH_MARGIN_MS > this.now()) return tokens.accessToken;
    return (await this.refresh()).accessToken;
  }

  async refresh(): Promise<RemoteTokens> {
    this.refreshing ??= (async () => {
      const tokens = await this.options.store.load();
      if (!tokens) throw new Error("Not authorized with the Hue Remote API yet (see: remote-auth).");
      return this.tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async tokenRequest(params: Record<string, string>): Promise<RemoteTokens> {
    const started = this.now();
    const { clientId, clientSecret } = this.options;
    // Hue also offers digest auth here; basic is simpler and the request is over TLS.
    const res = await this.fetchImpl(`${this.baseUrl}/v2/oauth2/token`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Hue Remote API token request (${params.grant_type}): HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    const data = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number | string };
    if (!data.access_token || !data.refresh_token) {
      throw new Error(`Hue Remote API token reply is missing tokens: ${text.slice(0, 300)}`);
    }
    const tokens: RemoteTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: started + Number(data.expires_in ?? 0) * 1000,
    };
    await this.options.store.save(tokens);
    return tokens;
  }
}

export interface RemoteTransportOptions {
  /** The bridge's app key. Not needed to press the link button or create one. */
  appKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export function remoteTransport(auth: HueRemoteAuth, options: RemoteTransportOptions = {}): HueTransport {
  const baseUrl = options.baseUrl ?? REMOTE_API;
  const fetchImpl = options.fetchImpl ?? globalFetch;
  const attempt = async (method: string, path: string, body: string | undefined, token: string) =>
    fetchImpl(`${baseUrl}/route${path}`, {
      method,
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(options.appKey ? { "hue-application-key": options.appKey } : {}),
      },
      body,
    });

  return {
    label: "Hue Remote API",
    async send(method, path, body) {
      const res = await attempt(method, path, body, await auth.accessToken());
      if (res.status !== 401) return res;
      // The token can be revoked or expire early; try once more with a fresh one.
      return attempt(method, path, body, (await auth.refresh()).accessToken);
    },
  };
}

/**
 * The authorization code from what the user pasted: the whole redirect URL
 * (whose `state` must match) or just the code.
 */
export function codeFromRedirect(pasted: string, state: string): string {
  const input = pasted.trim();
  if (!/^https?:\/\//i.test(input)) {
    if (!input) throw new Error("Nothing pasted.");
    return input;
  }
  const params = new URL(input).searchParams;
  const error = params.get("error");
  if (error) throw new Error(`Hue declined the authorization: ${error} ${params.get("error_description") ?? ""}`.trim());
  if (params.get("state") !== state) throw new Error("The redirect's state does not match; start remote-auth again.");
  const code = params.get("code");
  if (!code) throw new Error("The pasted URL has no code in it.");
  return code;
}
