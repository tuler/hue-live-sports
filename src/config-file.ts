import { existsSync, readFileSync } from "node:fs";
import { parseConfig, type Config } from "./config.ts";

export const DEFAULT_CONFIG_PATH = "config.json";

export function loadConfig(path = DEFAULT_CONFIG_PATH): Config {
  if (!existsSync(path)) {
    throw new Error(`Config file "${path}" not found. Copy config.example.json to ${path} and edit it.`);
  }
  return parseConfig(JSON.parse(readFileSync(path, "utf8")));
}
