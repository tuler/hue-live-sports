import type { Feeder } from "./feeder.ts";
import type { Games } from "./games.ts";
import type { User } from "./user.ts";

export interface Env {
  /** One per league: the shared tracker, fed through the webhook receiver. */
  GAMES: DurableObjectNamespace<Games>;
  /** One per league: polls ESPN on an alarm and posts to that league's receiver. */
  FEEDER: DurableObjectNamespace<Feeder>;
  /** One per user: settings, Hue tokens, and the queue of effects to play. */
  USER: DurableObjectNamespace<User>;
  /** Signs webhook deliveries, the feeder's included. */
  WEBHOOK_SECRET: string;
  HUE_CLIENT_ID: string;
  HUE_CLIENT_SECRET: string;
  /** Bearer token for the /users and /leagues admin routes. */
  ADMIN_TOKEN: string;
  /** Signs session and OAuth-state cookies. */
  SESSION_SECRET: string;
}
