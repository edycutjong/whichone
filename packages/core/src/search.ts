import { z } from "zod";
import type { NansenClient } from "./client.js";

/** One token returned by POST search/general (result_type=token). */
export const TokenSearchResult = z.object({
  name: z.string(),
  symbol: z.string(),
  chain: z.string(),
  address: z.string(),
  price: z.number().nullable().optional(),
  volume_24h: z.number().nullable().optional(),
  market_cap: z.number().nullable().optional(),
  rank: z.number().nullable().optional(),
});
export type TokenSearchResult = z.infer<typeof TokenSearchResult>;

// rows are validated one by one below: a single token with a null name must not sink every candidate for the ticker
const GeneralSearchResponse = z.object({
  tokens: z.array(z.unknown()).default([]),
  entities: z.array(z.unknown()).default([]),
  total_results: z.number().optional(),
});

export type Candidate = {
  chain: string;
  address: string;
  name: string;
  symbol: string;
  marketCap?: number;
  volume24h?: number;
  searchRank?: number;
};

const SEARCH_FIELDS = ["tokens[].name", "tokens[].symbol", "tokens[].chain", "tokens[].address", "tokens[].market_cap", "tokens[].volume_24h", "tokens[].rank"];

/**
 * Candidate set for a ticker: every token Nansen knows by that name/symbol across chains,
 * deduped by chain+address, ordered by Nansen's search rank. 0 credits.
 */
export async function searchCandidates(client: NansenClient, query: string, opts: { chain?: string; limit?: number; cap?: number } = {}): Promise<Candidate[]> {
  const body: Record<string, unknown> = {
    search_query: query.trim(),
    result_type: "token",
    limit: opts.limit ?? 50,
  };
  if (opts.chain) body.chain = opts.chain;
  const raw = await client.post("search/general", body, SEARCH_FIELDS);
  const parsed = GeneralSearchResponse.safeParse(raw);
  if (!parsed.success) throw new Error("Nansen search/general returned an unexpected shape (no tokens list)");
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const row of parsed.data.tokens) {
    const r = TokenSearchResult.safeParse(row);
    if (!r.success) continue;
    const t = r.data;
    const key = `${t.chain}:${t.address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      chain: t.chain,
      address: t.address,
      name: t.name,
      symbol: t.symbol,
      marketCap: t.market_cap ?? undefined,
      volume24h: t.volume_24h ?? undefined,
      searchRank: t.rank ?? undefined,
    });
  }
  out.sort((a, b) => (a.searchRank ?? 1e9) - (b.searchRank ?? 1e9));
  return opts.cap ? out.slice(0, opts.cap) : out;
}

/** Chains `tgm/flow-intelligence` accepts (openapi.json TGMFlowIntelligenceChain, 2026-09-16). `hyperliquid` (perps) is not scorable. */
export const SCORABLE_CHAINS = new Set([
  "arbitrum",
  "avalanche",
  "base",
  "bnb",
  "ethereum",
  "hyperevm",
  "injective",
  "linea",
  "mantle",
  "mantra",
  "monad",
  "near",
  "optimism",
  "plasma",
  "polygon",
  "robinhood",
  "sei",
  "solana",
  "sonic",
  "starknet",
  "sui",
  "ton",
  "tron",
]);

export function scorable(c: Candidate): boolean {
  return SCORABLE_CHAINS.has(c.chain);
}

/** Same-name filter: symbol or name matches the query case-insensitively (search may return fuzzy hits). */
export function sameName(query: string, c: Candidate): boolean {
  const q = query.trim().toLowerCase();
  return c.symbol.toLowerCase() === q || c.name.toLowerCase() === q;
}
