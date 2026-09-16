import { z } from "zod";
import type { NansenClient } from "./client.js";
import type { Candidate } from "./search.js";

/** POST tgm/flow-intelligence → data[0]: wallet counts + net flow per label class. 1 credit. */
const FlowRow = z.object({
  smart_trader_wallet_count: z.number().nullable().optional(),
  smart_trader_net_flow_usd: z.number().nullable().optional(),
  whale_wallet_count: z.number().nullable().optional(),
  whale_net_flow_usd: z.number().nullable().optional(),
  top_pnl_wallet_count: z.number().nullable().optional(),
  top_pnl_net_flow_usd: z.number().nullable().optional(),
  public_figure_wallet_count: z.number().nullable().optional(),
  public_figure_net_flow_usd: z.number().nullable().optional(),
  exchange_wallet_count: z.number().nullable().optional(),
  exchange_net_flow_usd: z.number().nullable().optional(),
  fresh_wallets_wallet_count: z.number().nullable().optional(),
  fresh_wallets_net_flow_usd: z.number().nullable().optional(),
});
const FlowResponse = z.object({ data: z.array(FlowRow).default([]) });

/** POST tgm/token-information → data: deployment date + market metrics. 1 credit. */
const TokenInfoResponse = z.object({
  data: z
    .object({
      name: z.string().nullable().optional(),
      symbol: z.string().nullable().optional(),
      logo: z.string().nullable().optional(),
      token_details: z
        .object({
          token_deployment_date: z.string().nullable().optional(),
          website: z.string().nullable().optional(),
          x: z.string().nullable().optional(),
          market_cap_usd: z.number().nullable().optional(),
          fdv_usd: z.number().nullable().optional(),
        })
        .nullable()
        .optional(),
      spot_metrics: z
        .object({
          volume_total_usd: z.number().nullable().optional(),
          unique_buyers: z.number().nullable().optional(),
          unique_sellers: z.number().nullable().optional(),
          liquidity_usd: z.number().nullable().optional(),
          total_holders: z.number().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

/** POST tgm/holders → data[]: labelled holder rows. 5 credits. */
const HolderRow = z.object({
  address: z.string(),
  address_label: z.string().nullable().optional(),
  ownership_percentage: z.number().nullable().optional(),
  value_usd: z.number().nullable().optional(),
});
const HoldersResponse = z.object({ data: z.array(HolderRow).default([]) });

/** Symbols where many same-name results are canonical per-chain issues, not impostors. */
export const STABLECOINS = new Set(["USDC", "USDT", "DAI", "USDE", "USDS", "PYUSD", "FDUSD", "TUSD", "USD1", "USDG", "EURC", "GHO", "FRAX", "LUSD", "CRVUSD"]);

/** The Nansen facts one candidate is scored on. Every field is a Nansen response field, nothing derived yet. */
export type CandidateFacts = Candidate & {
  /** Smart Trader + Whale + Top PnL + Public Figure wallets active in the 7d window. */
  labelledWallets: number;
  smartTraderWallets: number;
  whaleWallets: number;
  topPnlWallets: number;
  publicFigureWallets: number;
  /** Nansen does not track wallet counts for the exchange / fresh classes (always 0, per API warnings) — use the USD flows. */
  smartTraderNetFlowUsd: number;
  exchangeNetFlowUsd: number;
  freshNetFlowUsd: number;
  /** true when any labelled exchange moved this token in the window (exchange_net_flow_usd ≠ 0). */
  exchangeTouched: boolean;
  /** |fresh net flow| / Σ|net flow| over all classes, 0–1; NaN when nothing flowed. */
  freshShare: number;
  ageDays?: number;
  deploymentDate?: string;
  liquidityUsd?: number;
  totalHolders?: number;
  uniqueBuyers?: number;
  marketCapUsd?: number;
  logo?: string;
  website?: string;
  /**
   * Top-20 holders carrying ANY non-premium Nansen tag, set only for finalists. These are wealth/activity tags
   * ("Token Millionaire", "<TOKEN> Whale", "Liquidity Pool", ENS names) — NOT exchange/fund/Smart Money entity
   * labels, which are the 150-credit premium tier and deliberately not used. Real tokens: 18–20/20; impostors: few.
   */
  recognisedHolders?: number;
  topHolderPct?: number;
  topLabels?: string[];
  /** which lookups failed; the candidate is still shown, marked unscored/partial */
  errors: string[];
};

const FLOW_FIELDS = [
  "smart_trader_wallet_count", "whale_wallet_count", "top_pnl_wallet_count", "public_figure_wallet_count",
  "smart_trader_net_flow_usd", "whale_net_flow_usd", "top_pnl_net_flow_usd", "public_figure_net_flow_usd",
  "exchange_net_flow_usd", "fresh_wallets_net_flow_usd",
];
const INFO_FIELDS = ["token_details.token_deployment_date", "token_details.market_cap_usd", "spot_metrics.liquidity_usd", "spot_metrics.total_holders", "spot_metrics.unique_buyers"];
const HOLDER_FIELDS = ["data[].address_label", "data[].ownership_percentage"];

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Pull flow-intelligence (7d) + token-information for one candidate. 2 credits. Never throws: failures land in `errors`. */
export async function fetchFacts(client: NansenClient, c: Candidate, now = Date.now()): Promise<CandidateFacts> {
  const base: CandidateFacts = {
    ...c,
    labelledWallets: 0, smartTraderWallets: 0, whaleWallets: 0, topPnlWallets: 0, publicFigureWallets: 0,
    smartTraderNetFlowUsd: 0, exchangeNetFlowUsd: 0, freshNetFlowUsd: 0, exchangeTouched: false,
    freshShare: NaN, errors: [],
  };
  const [flow, info] = await Promise.allSettled([
    client.post("tgm/flow-intelligence", { chain: c.chain, token_address: c.address, timeframe: "7d" }, FLOW_FIELDS),
    // secondary facts: shorter timeout, no retry — a hung call degrades this candidate to "age unknown", never stalls the verdict
    client.post("tgm/token-information", { chain: c.chain, token_address: c.address, timeframe: "7d" }, INFO_FIELDS, { timeoutMs: 4000, retries: 0 }),
  ]);

  if (flow.status === "fulfilled") {
    const parsed = FlowResponse.safeParse(flow.value);
    const r = parsed.success ? parsed.data.data[0] : undefined;
    // An empty row is EVIDENCE (Nansen saw no flow at all — a dead token), not a failure: keep the zeros, note it.
    if (!r) base.errors.push(parsed.success ? "note: flow-intelligence returned no row (no activity in 7d)" : "flow-intelligence failed: schema");
    else {
      base.smartTraderWallets = n(r.smart_trader_wallet_count);
      base.whaleWallets = n(r.whale_wallet_count);
      base.topPnlWallets = n(r.top_pnl_wallet_count);
      base.publicFigureWallets = n(r.public_figure_wallet_count);
      base.labelledWallets = base.smartTraderWallets + base.whaleWallets + base.topPnlWallets + base.publicFigureWallets;
      base.smartTraderNetFlowUsd = n(r.smart_trader_net_flow_usd);
      base.exchangeNetFlowUsd = n(r.exchange_net_flow_usd);
      base.freshNetFlowUsd = n(r.fresh_wallets_net_flow_usd);
      base.exchangeTouched = Math.abs(base.exchangeNetFlowUsd) > 0;
      const flows = [r.smart_trader_net_flow_usd, r.whale_net_flow_usd, r.top_pnl_net_flow_usd, r.public_figure_net_flow_usd, r.exchange_net_flow_usd, r.fresh_wallets_net_flow_usd].map(n);
      const total = flows.reduce((a, b) => a + Math.abs(b), 0);
      base.freshShare = total > 0 ? Math.abs(base.freshNetFlowUsd) / total : NaN;
    }
  } else base.errors.push(`flow-intelligence failed: ${String(flow.reason?.message ?? flow.reason).slice(0, 80)}`);

  if (info.status === "fulfilled") {
    const parsed = TokenInfoResponse.safeParse(info.value);
    const d = parsed.success ? parsed.data.data : undefined;
    if (!d) base.errors.push(parsed.success ? "token-information failed: empty" : "token-information failed: schema");
    else {
      const dep = d.token_details?.token_deployment_date ?? undefined;
      if (dep) {
        const t = Date.parse(/\d{4}-\d{2}-\d{2} \d/.test(dep) ? dep.replace(" ", "T") + "Z" : dep);
        if (Number.isFinite(t)) { base.deploymentDate = dep; base.ageDays = Math.max(0, Math.floor((now - t) / 86_400_000)); }
      }
      base.marketCapUsd = d.token_details?.market_cap_usd ?? base.marketCap;
      base.liquidityUsd = d.spot_metrics?.liquidity_usd ?? undefined;
      base.totalHolders = d.spot_metrics?.total_holders ?? undefined;
      base.uniqueBuyers = d.spot_metrics?.unique_buyers ?? undefined;
      base.logo = d.logo ?? undefined;
      base.website = d.token_details?.website ?? undefined;
    }
  } else base.errors.push(`token-information failed: ${String(info.reason?.message ?? info.reason).slice(0, 80)}`);

  return base;
}

/** Tiebreak facts for a finalist: how many of the top holders Nansen recognises (any non-premium tag). 5 credits. */
export async function fetchHolderFacts(client: NansenClient, f: CandidateFacts, perPage = 20): Promise<CandidateFacts> {
  try {
    const raw = await client.post("tgm/holders", { chain: f.chain, token_address: f.address, pagination: { page: 1, per_page: perPage } }, HOLDER_FIELDS, { timeoutMs: 5000, retries: 0 });
    const parsed = HoldersResponse.safeParse(raw);
    if (!parsed.success) { f.errors.push("holders failed: schema"); return f; }
    const rows = parsed.data.data;
    const tagged = rows.filter((r) => r.address_label && r.address_label.trim().length > 0 && r.address_label !== "Token Contract");
    f.recognisedHolders = tagged.length;
    // most frequent tags first, so the reason line reads "Token Millionaire ×17, Liquidity Pool"
    const freq = new Map<string, number>();
    for (const r of tagged) freq.set(r.address_label as string, (freq.get(r.address_label as string) ?? 0) + 1);
    f.topLabels = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l, n]) => (n > 1 ? `${l} ×${n}` : l));
    f.topHolderPct = rows.reduce((m, r) => Math.max(m, n(r.ownership_percentage)), 0);
  } catch (e) {
    f.errors.push(`holders failed: ${String((e as Error).message).slice(0, 80)}`);
  }
  return f;
}
