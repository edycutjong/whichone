import { CachedNansenClient, DiskCache, whichOnesReal, type VerdictOptions } from "@whichone/core";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * One engine for every route. The cache is a disk cache: `.cache/` locally, `/tmp` on Vercel (the only writable path
 * there, per-instance — a warm instance answers a repeat query at 0 credits, a cold one goes live). Never a database.
 */
const dir = process.env.VERCEL ? join(tmpdir(), "whichone-cache") : join(process.cwd(), "../../.cache");
let store: DiskCache | undefined;

export function client(): CachedNansenClient {
  store ??= new DiskCache(dir);
  return new CachedNansenClient(process.env.NANSEN_API_KEY ?? "", { store });
}

export const SAFE_QUERY = /^[A-Za-z0-9 ._$-]{1,32}$/;
export const CHAINS = ["ethereum", "base", "solana", "bnb", "arbitrum", "polygon", "avalanche"] as const;

export async function verdictFor(q: string, chain?: string, opts: Omit<VerdictOptions, "chain"> = {}) {
  const c = client();
  const v = await whichOnesReal(c, q, { chain, ...opts });
  return { verdict: v, oldestHit: c.oldestHit };
}
