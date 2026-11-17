/**
 * Signed cookies: the login session and the OAuth `state` check. A cookie
 * value is `<base64url payload>.<hex HMAC>`, so the Worker keeps no session
 * table. The user id is the Hue bridge id, learned at sign-in.
 */
import { hmac, sameText } from "../sources/webhook.ts";

export const SESSION_COOKIE = "hls_session";
export const STATE_COOKIE = "hls_oauth_state";
export const SESSION_DAYS = 30;
const STATE_MINUTES = 10;

const b64 = (text: string) => btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unb64 = (text: string) => atob(text.replaceAll("-", "+").replaceAll("_", "/"));

interface Signed {
  /** The signed value: a user id, or an OAuth state. */
  v: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

async function sign(value: string, ttlMs: number, secret: string): Promise<string> {
  const payload = b64(JSON.stringify({ v: value, exp: Date.now() + ttlMs } satisfies Signed));
  return `${payload}.${await hmac(secret, payload)}`;
}

async function verify(token: string | undefined, secret: string): Promise<string | undefined> {
  const [payload, mac] = (token ?? "").split(".");
  if (!payload || !mac || !sameText(mac, await hmac(secret, payload))) return undefined;
  try {
    const { v, exp } = JSON.parse(unb64(payload)) as Signed;
    return typeof v === "string" && exp > Date.now() ? v : undefined;
  } catch {
    return undefined;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

const cookie = (name: string, value: string, maxAgeSeconds: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

export const clearCookie = (name: string) => cookie(name, "", 0);

export async function sessionCookie(userId: string, secret: string): Promise<string> {
  const ttl = SESSION_DAYS * 24 * 3600;
  return cookie(SESSION_COOKIE, await sign(userId, ttl * 1000, secret), ttl);
}

/** The signed-in user's id, if the session cookie is valid. */
export const sessionUser = (req: Request, secret: string) => verify(readCookie(req, SESSION_COOKIE), secret);

/** A fresh OAuth state and the cookie that remembers it for the callback. */
export async function oauthState(secret: string): Promise<{ state: string; cookie: string }> {
  const state = crypto.randomUUID();
  return { state, cookie: cookie(STATE_COOKIE, await sign(state, STATE_MINUTES * 60_000, secret), STATE_MINUTES * 60) };
}

/** Whether `state` from the callback is the one this browser was sent off with. */
export async function checkState(req: Request, state: string, secret: string): Promise<boolean> {
  const expected = await verify(readCookie(req, STATE_COOKIE), secret);
  return expected !== undefined && sameText(expected, state);
}
