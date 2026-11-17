/**
 * Route to the bridge over the local network. Bun only: it reads the CA file
 * and uses Bun's `tls` fetch option, so it stays out of anything bound for a Worker.
 */
import { readFileSync } from "node:fs";
import type { HueTransport } from "./hue.ts";

export interface LocalBridgeOptions {
  ip: string;
  appKey?: string;
  /** PEM file with the Hue root CA. Without it the bridge certificate is not verified. */
  caFile?: string;
  /** Bridge id, checked against the certificate's common name when `caFile` is set. */
  bridgeId?: string;
}

export function localTransport(options: LocalBridgeOptions): HueTransport {
  // The bridge serves a certificate issued by Signify's private CA for its
  // bridge id, not its IP, so the default verification cannot pass.
  const { caFile, bridgeId } = options;
  const tls: NonNullable<BunFetchRequestInit["tls"]> = caFile
    ? {
        ca: readFileSync(caFile, "utf8"),
        checkServerIdentity: (_host, cert) => {
          const cn = String(cert.subject.CN ?? "");
          return !bridgeId || cn.toLowerCase() === bridgeId.toLowerCase()
            ? undefined
            : new Error(`Bridge certificate is for "${cn}", expected ${bridgeId}`);
        },
      }
    : { rejectUnauthorized: false };

  return {
    label: "Hue bridge",
    send: (method, path, body) =>
      fetch(`https://${options.ip}${path}`, {
        method,
        tls,
        signal: AbortSignal.timeout(8_000),
        headers: {
          "content-type": "application/json",
          ...(options.appKey ? { "hue-application-key": options.appKey } : {}),
        },
        body,
      }),
  };
}
