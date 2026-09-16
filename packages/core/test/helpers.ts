import { NansenClient, type ClientOptions } from "../src/client.js";
import type { CandidateFacts } from "../src/facts.js";

/** A NansenClient whose network is a lookup table: (endpoint, body) → JSON. Records calls like the real one. */
export function fakeClient(routes: (endpoint: string, body: Record<string, unknown>) => unknown, opts: ClientOptions = {}) {
  const fetchImpl: typeof fetch = async (url, init) => {
    const endpoint = String(url).replace("https://api.nansen.ai/api/v1/", "");
    const body = JSON.parse(String(init?.body ?? "{}"));
    const out = routes(endpoint, body);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  };
  return new NansenClient("nsn_test_key_0000000000000000000000", { fetchImpl, rps: 1000, ...opts });
}

export function facts(over: Partial<CandidateFacts> = {}): CandidateFacts {
  return {
    chain: "ethereum", address: "0x" + "a".repeat(40), name: "Tok", symbol: "TOK",
    labelledWallets: 0, smartTraderWallets: 0, whaleWallets: 0, topPnlWallets: 0, publicFigureWallets: 0,
    smartTraderNetFlowUsd: 0, exchangeNetFlowUsd: 0, freshNetFlowUsd: 0, exchangeTouched: false, freshShare: NaN,
    errors: [], ...over,
  };
}

export const flowRow = (o: Record<string, number> = {}) => ({
  data: [{
    smart_trader_wallet_count: 0, smart_trader_net_flow_usd: 0, whale_wallet_count: 0, whale_net_flow_usd: 0,
    top_pnl_wallet_count: 0, top_pnl_net_flow_usd: 0, public_figure_wallet_count: 0, public_figure_net_flow_usd: 0,
    exchange_wallet_count: 0, exchange_net_flow_usd: 0, fresh_wallets_wallet_count: 0, fresh_wallets_net_flow_usd: 0, ...o,
  }],
  warnings: [],
});
export const infoRow = (o: { deployed?: string; holders?: number; liquidity?: number; mc?: number } = {}) => ({
  data: {
    name: "Tok", symbol: "TOK", logo: null,
    token_details: { token_deployment_date: o.deployed ?? "2023-04-14 14:51:35", website: null, x: null, market_cap_usd: o.mc ?? 1e6, fdv_usd: null },
    spot_metrics: { volume_total_usd: 0, unique_buyers: 10, unique_sellers: 10, liquidity_usd: o.liquidity ?? 1e5, total_holders: o.holders ?? 1000 },
  },
});
export const holdersRows = (labels: (string | null)[]) => ({
  data: labels.map((l, i) => ({ address: "0x" + String(i).padStart(40, "0"), address_label: l, ownership_percentage: 1, value_usd: 1 })),
  pagination: { page: 1, per_page: 20 }, warnings: [],
});
export const searchTokens = (tokens: Array<{ chain: string; address: string; symbol?: string; name?: string; rank?: number; market_cap?: number }>) => ({
  tokens: tokens.map((t, i) => ({ name: t.name ?? "Pepe", symbol: t.symbol ?? "PEPE", chain: t.chain, address: t.address, price: 1, volume_24h: 1, market_cap: t.market_cap ?? 1, rank: t.rank ?? i + 1 })),
  entities: [], total_results: tokens.length,
});
