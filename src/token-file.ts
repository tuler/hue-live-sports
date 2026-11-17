/** Keeps Hue Remote API tokens in a local JSON file, readable only by its owner. */
import { chmod, readFile, writeFile } from "node:fs/promises";
import type { RemoteTokens, TokenStore } from "./hue-remote.ts";

export const DEFAULT_TOKEN_FILE = ".hue-tokens.json";

export function fileTokenStore(path: string): TokenStore {
  return {
    async load() {
      const text = await readFile(path, "utf8").catch((err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return undefined;
        throw err;
      });
      return text === undefined ? undefined : (JSON.parse(text) as RemoteTokens);
    },
    async save(tokens) {
      await writeFile(path, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
      // `mode` only applies when the file is created.
      await chmod(path, 0o600);
    },
  };
}
