import { CachedNansenClient, DiskCache, whichOnesReal, type CallEvent, type VerdictOptions } from "@whichone/core";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * One engine for every route. The cache is a disk cache: the repo's `.cache/` locally, `/tmp` on Vercel (the only
 * writable path there, per-instance — a warm instance answers a repeat query at 0 credits, a cold one goes live).
 * Never a database. Locally the repo root is found from the cwd: `next dev` runs in apps/web, vitest at the root.
 */
const repoRoot = existsSync(join(process.cwd(), "apps", "web")) ? process.cwd() : join(process.cwd(), "..", "..");
const dir = process.env.VERCEL ? join(tmpdir(), "whichone-cache") : join(repoRoot, ".cache");
let store: DiskCache | undefined;

export function client(onCall?: (e: CallEvent) => void): CachedNansenClient {
  store ??= new DiskCache(dir);
  return new CachedNansenClient(process.env.NANSEN_API_KEY ?? "", { store, onCall });
}

/** Engine options a route may pass: the verdict progress events plus the per-call stream the rail renders. */
export type EngineOptions = Omit<VerdictOptions, "chain"> & { onCall?: (e: CallEvent) => void };

// 44 so a pasted contract address (42 hex / up to 44 base58) reaches the engine and gets the "type the ticker" hint
export const SAFE_QUERY = /^[A-Za-z0-9 ._$-]{1,44}$/;
export const CHAINS = ["ethereum", "base", "solana", "bnb", "arbitrum", "polygon", "avalanche"] as const;

export async function verdictFor(q: string, chain?: string, { onCall, ...opts }: EngineOptions = {}) {
  const c = client(onCall);
  const v = await whichOnesReal(c, q, { chain, ...opts });
  return { verdict: v, oldestHit: c.oldestHit };
}
