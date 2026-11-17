import { describe, expect, it } from "bun:test";
import { fetchTeams } from "../src/espn.ts";
import { checkState, oauthState, readCookie, sessionCookie, sessionUser, SESSION_COOKIE, STATE_COOKIE } from "../src/worker/session.ts";

const SECRET = "session-secret";
/** A request carrying the cookie a Set-Cookie header would have set. */
const withCookie = (setCookie: string) => new Request("https://x/", { headers: { cookie: setCookie.split(";")[0]! } });

describe("session cookies", () => {
  it("round-trips a signed user id with safe cookie attributes", async () => {
    const set = await sessionCookie("001788fffe123456", SECRET);
    expect(set).toMatch(/^hls_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
    expect(await sessionUser(withCookie(set), SECRET)).toBe("001788fffe123456");
  });

  it("rejects a tampered, foreign or missing cookie", async () => {
    const set = await sessionCookie("001788fffe123456", SECRET);
    const value = readCookie(withCookie(set), SESSION_COOKIE)!;
    const [payload, mac] = value.split(".");
    const forged = btoa(JSON.stringify({ v: "someone-else", exp: Date.now() + 1e9 })).replace(/=+$/, "");
    expect(await sessionUser(withCookie(`${SESSION_COOKIE}=${forged}.${mac}`), SECRET)).toBeUndefined();
    expect(await sessionUser(withCookie(`${SESSION_COOKIE}=${payload}.00`), SECRET)).toBeUndefined();
    expect(await sessionUser(withCookie(set), "other-secret")).toBeUndefined();
    expect(await sessionUser(new Request("https://x/"), SECRET)).toBeUndefined();
  });

  it("accepts only the OAuth state this browser was sent off with", async () => {
    const { state, cookie } = await oauthState(SECRET);
    expect(cookie.startsWith(`${STATE_COOKIE}=`)).toBe(true);
    expect(await checkState(withCookie(cookie), state, SECRET)).toBe(true);
    expect(await checkState(withCookie(cookie), crypto.randomUUID(), SECRET)).toBe(false);
    expect(await checkState(new Request("https://x/"), state, SECRET)).toBe(false);
  });
});

describe("fetchTeams", () => {
  it("reads ESPN's teams list, skipping malformed entries", async () => {
    const fake = (async () =>
      Response.json({
        sports: [{ leagues: [{ teams: [
          { team: { abbreviation: "LIV", displayName: "Liverpool", color: "d11317", alternateColor: "f6eb61" } },
          { team: { abbreviation: "ARS", displayName: "Arsenal", color: "e20520" } },
          { team: { displayName: "No abbreviation" } },
        ] }] }],
      })) as unknown as typeof fetch;
    expect(await fetchTeams("soccer/eng.1", fake)).toEqual([
      { abbreviation: "ARS", name: "Arsenal", color: "e20520", alternateColor: undefined },
      { abbreviation: "LIV", name: "Liverpool", color: "d11317", alternateColor: "f6eb61" },
    ]);
  });
});
