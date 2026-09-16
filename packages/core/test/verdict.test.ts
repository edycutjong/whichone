import { describe, it, expect } from "vitest";
import { whichOnesReal } from "../src/verdict.js";
import { fakeClient, searchTokens, flowRow, infoRow, holdersRows } from "./helpers.js";

const NOW = Date.parse("2026-09-16T12:00:00Z");
const REAL = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const IMP = "0x" + "b".repeat(40);
const OLD = "0x" + "c".repeat(40);

/** Routes modelled on the live PEPE probe: one real, one 3-day-old impostor, one old dead token, one perp market. */
function pepeRoutes(endpoint: string, body: Record<string, unknown>) {
  if (endpoint === "search/general") return searchTokens([
    { chain: "hyperliquid", address: "PEPE", rank: 1 },
    { chain: "ethereum", address: REAL, rank: 2, market_cap: 1.4e9 },
    { chain: "base", address: IMP, rank: 3, market_cap: 2e9 },          // impostor with the bigger cap
    { chain: "base", address: OLD, rank: 4 },
    { chain: "solana", address: "Fuzzy", rank: 5, symbol: "PEPEX", name: "Pepe X" }, // fuzzy hit, filtered
  ]);
  const a = String(body.token_address);
  if (endpoint === "tgm/flow-intelligence") {
    if (a === REAL) return flowRow({ smart_trader_wallet_count: 38, top_pnl_wallet_count: 26, whale_wallet_count: 1, public_figure_wallet_count: 4, exchange_net_flow_usd: 1_895_861, fresh_wallets_net_flow_usd: 17_027_659, smart_trader_net_flow_usd: 29_948 });
    if (a === IMP) return flowRow({ fresh_wallets_net_flow_usd: 90_000, exchange_net_flow_usd: 300 });
    return flowRow({ exchange_net_flow_usd: 4_310 });
  }
  if (endpoint === "tgm/token-information") {
    if (a === REAL) return infoRow({ deployed: "2023-04-14 14:51:35", holders: 400_392, liquidity: 13_803_928 });
    if (a === IMP) return infoRow({ deployed: "2026-09-13 09:00:00", holders: 900, liquidity: 500_000 });
    return infoRow({ deployed: "2024-08-10 00:00:00", holders: 11_225, liquidity: 176_747 });
  }
  if (endpoint === "tgm/holders") return holdersRows(a === REAL ? Array(18).fill("Binance").concat(["Token Contract", null]) : [null, null, null]);
  throw new Error("unexpected " + endpoint);
}

describe("whichOnesReal()", () => {
  it("crowns the labelled token over a younger, bigger-cap impostor; flags the impostor; excludes fuzzy and perp rows from ranking", async () => {
    const c = fakeClient(pepeRoutes);
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    expect(v.abstained).toBe(false);
    expect(v.winner?.address).toBe(REAL);
    expect(v.candidatesTotal).toBe(4);                       // fuzzy "PEPEX" filtered out
    expect(v.ranked.map((s) => s.scorable)).toEqual([true, true, true, false]);   // perp last
    const imp = v.ranked.find((s) => s.address === IMP)!;
    expect(imp.impostor).toBe(true);
    expect(imp.reasons).toContain("deployed 3d ago");
    expect(imp.reasons.some((r) => r.includes("% of flow is fresh wallets"))).toBe(true);
    expect(v.ranked.find((s) => s.address === OLD)!.impostor).toBe(false);
    expect(v.winner!.reasons).toContain("18 of top 20 holders tagged by Nansen (Binance ×18)");
  });
  it("spends ≤ 26 credits and lists every call in provenance with fields used", async () => {
    const c = fakeClient(pepeRoutes);
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    expect(v.credits).toBeLessThanOrEqual(26);
    expect(v.credits).toBe(0 + 3 * 2 + 2 * 5);               // search 0, 3 scorable × 2, 2 finalists × 5
    expect(v.provenance.every((p) => p.fieldsUsed.length > 0)).toBe(true);
    expect(v.provenance.filter((p) => p.endpoint === "tgm/holders")).toHaveLength(2);
  });
  it("hash covers the decision only: identical inputs → identical hash; a different winner → different hash", async () => {
    const a = await whichOnesReal(fakeClient(pepeRoutes), "PEPE", { now: NOW });
    const b = await whichOnesReal(fakeClient(pepeRoutes), "PEPE", { now: NOW });
    expect(a.hash).toBe(b.hash);
    const bnbOnly = await whichOnesReal(fakeClient(pepeRoutes), "PEPE", { now: NOW, chain: "base" });
    expect(bnbOnly.hash).not.toBe(a.hash);
  });
  it("abstains with the exact copy when search is empty", async () => {
    const v = await whichOnesReal(fakeClient(() => ({ tokens: [], entities: [], total_results: 0 })), "XQZPLM");
    expect(v.abstained).toBe(true);
    expect(v.winner).toBeNull();
    expect(v.abstainReason).toBe("no token named XQZPLM on Nansen");
    expect(v.credits).toBe(0);
  });
  it("abstains when every candidate is unlabelled and young", async () => {
    const c = fakeClient((ep, body) => {
      if (ep === "search/general") return searchTokens([{ chain: "base", address: IMP }, { chain: "solana", address: "S1" }]);
      if (ep === "tgm/flow-intelligence") return flowRow({ fresh_wallets_net_flow_usd: 5000 });
      if (ep === "tgm/token-information") return infoRow({ deployed: "2026-09-14 00:00:00", holders: 120 });
      return holdersRows([null, null]);
    });
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    expect(v.abstained).toBe(true);
    expect(v.abstainReason).toMatch(/none of these looks real/);
    expect(v.ranked.every((s) => s.impostor)).toBe(true);
  });
  it("abstains when the only candidates are on unscorable chains", async () => {
    const c = fakeClient(() => searchTokens([{ chain: "hyperliquid", address: "PEPE" }]));
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    expect(v.abstained).toBe(true);
    expect(v.abstainReason).toMatch(/chain Nansen can score/);
    expect(v.ranked[0].reasons[0]).toMatch(/perp market/);
  });
  it("stablecoins: no impostor flags, header flag set", async () => {
    const c = fakeClient((ep, body) => {
      if (ep === "search/general") return searchTokens([{ chain: "ethereum", address: "U1", symbol: "USDC", name: "USD Coin" }, { chain: "sei", address: "U2", symbol: "USDC", name: "USD Coin" }]);
      if (ep === "tgm/flow-intelligence") return String(body.token_address) === "U1" ? flowRow({ smart_trader_wallet_count: 50, exchange_net_flow_usd: 5e7 }) : flowRow({});
      if (ep === "tgm/token-information") return String(body.token_address) === "U1" ? infoRow({ holders: 3e6 }) : infoRow({ deployed: "2026-09-15 00:00:00", holders: 40 });
      return holdersRows(["Circle", null]);
    });
    const v = await whichOnesReal(c, "USDC", { now: NOW });
    expect(v.stablecoin).toBe(true);
    expect(v.ranked.some((s) => s.impostor)).toBe(false);
    expect(v.winner?.address).toBe("U1");
  });
  it("a failed lookup degrades that candidate only; the query still resolves", async () => {
    const c = fakeClient((ep, body) => {
      if (ep === "search/general") return searchTokens([{ chain: "ethereum", address: REAL }, { chain: "base", address: OLD }]);
      if (String(body.token_address) === OLD && ep === "tgm/token-information") return new Response("boom", { status: 500 });
      return pepeRoutes(ep, body);
    });
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    expect(v.winner?.address).toBe(REAL);
    const broken = v.ranked.find((s) => s.address === OLD)!;
    expect(broken.errors[0]).toMatch(/token-information/);
    expect(broken.reasons).toContain("age unknown");
  });
  it("cap limits scored candidates; finalists gets holders calls", async () => {
    const c = fakeClient((ep, body) => {
      if (ep === "search/general") return searchTokens(Array.from({ length: 12 }, (_, i) => ({ chain: "ethereum", address: "0x" + String(i).padStart(2, "0").repeat(20) })));
      if (ep === "tgm/flow-intelligence") return flowRow({ smart_trader_wallet_count: 1 });
      if (ep === "tgm/token-information") return infoRow({});
      return holdersRows([null]);
    });
    const v = await whichOnesReal(c, "PEPE", { now: NOW, cap: 8, finalists: 1 });
    expect(v.ranked).toHaveLength(8);
    expect(v.candidatesTotal).toBe(12);
    expect(v.provenance.filter((p) => p.endpoint === "tgm/holders")).toHaveLength(1);
  });
});

describe("review fixes F3/F4 (2026-09-16)", () => {
  it("F3: a candidate whose flow lookup failed is UNCHECKED — never crowned, never an impostor, and the verdict warns", async () => {
    const c = fakeClient((ep, body) => {
      if (ep === "tgm/flow-intelligence" && String(body.token_address) === REAL) return new Response("boom", { status: 503 });
      return pepeRoutes(ep, body);
    });
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    const real = v.ranked.find((s) => s.address === REAL)!;
    expect(real.unchecked).toBe(true);
    expect(real.impostor).toBe(false);
    expect(real.reasons[0]).toMatch(/could not be checked/);
    expect(v.winner?.address).not.toBe(REAL);
    expect(v.warnings[0]).toMatch(/1 candidate could not be checked/);
    // unchecked ranks above unscorable, below every checked candidate
    const order = v.ranked.map((s) => (!s.scorable ? "perp" : s.unchecked ? "unchecked" : "ok"));
    expect(order).toEqual(["ok", "ok", "unchecked", "perp"]);
  });
  it("F3: when every candidate fails, the verdict abstains with a retry message", async () => {
    const c = fakeClient((ep) => ep === "search/general" ? searchTokens([{ chain: "ethereum", address: REAL }]) : new Response("down", { status: 502 }));
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    expect(v.abstained).toBe(true);
    expect(v.abstainReason).toMatch(/retry/);
  });
  it("F3: a token-information failure alone still scores, flagged partial with age unknown", async () => {
    const c = fakeClient((ep, body) => (ep === "tgm/token-information" && String(body.token_address) === REAL) ? new Response("boom", { status: 500 }) : pepeRoutes(ep, body));
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    const real = v.ranked.find((s) => s.address === REAL)!;
    expect(real.unchecked).toBe(false);
    expect(real.reasons).toContain("age unknown");
    expect(real.reasons.at(-1)).toMatch(/^partial: token-information lookup failed/);
  });
  it("F4: the hash ignores volatile search fields (market cap, volume, rank) and error text", async () => {
    const volatile = (mc: number) => (ep: string, body: Record<string, unknown>) => {
      if (ep === "search/general") { const r = pepeRoutes(ep, body) as ReturnType<typeof searchTokens>; r.tokens = r.tokens.map((t) => ({ ...t, market_cap: mc, volume_24h: mc * 3, rank: t.rank! + 7 })); return r; }
      return pepeRoutes(ep, body);
    };
    const a = await whichOnesReal(fakeClient(volatile(1)), "PEPE", { now: NOW });
    const b = await whichOnesReal(fakeClient(volatile(999_999)), "PEPE", { now: NOW });
    expect(a.hash).toBe(b.hash);
  });
  it("F4: the hash changes when the winner or an impostor flag changes", async () => {
    const base = await whichOnesReal(fakeClient(pepeRoutes), "PEPE", { now: NOW });
    const noImp = await whichOnesReal(fakeClient((ep, body) => (ep === "tgm/token-information" && String(body.token_address) === IMP) ? infoRow({ deployed: "2020-01-01 00:00:00", holders: 900 }) : pepeRoutes(ep, body)), "PEPE", { now: NOW });
    expect(noImp.hash).not.toBe(base.hash);
  });
});

describe("review round 2 (2026-09-16)", () => {
  it("R2-1: an EMPTY flow row is evidence (dead token), not a failure — still scored, can be an impostor", async () => {
    const c = fakeClient((ep, body) => {
      if (ep === "tgm/flow-intelligence" && String(body.token_address) === IMP) return { data: [], warnings: [] };
      return pepeRoutes(ep, body);
    });
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    const imp = v.ranked.find((s) => s.address === IMP)!;
    expect(imp.unchecked).toBe(false);
    expect(imp.impostor).toBe(true);
    expect(v.warnings.some((w) => w.includes("could not be checked"))).toBe(false);
  });
  it("R2-1: all-empty flow rows abstain with 'none of these looks real', not 'retry'", async () => {
    const c = fakeClient((ep) => {
      if (ep === "search/general") return searchTokens([{ chain: "base", address: IMP }]);
      if (ep === "tgm/flow-intelligence") return { data: [], warnings: [] };
      if (ep === "tgm/token-information") return infoRow({ deployed: "2026-09-14 00:00:00", holders: 50 });
      return holdersRows([null]);
    });
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    expect(v.abstainReason).toMatch(/none of these looks real/);
  });
  it("R2-3: the unchecked warning counts only checked candidates (perp rows excluded)", async () => {
    const c = fakeClient((ep, body) => (ep === "tgm/flow-intelligence" && String(body.token_address) === OLD) ? new Response("x", { status: 503 }) : pepeRoutes(ep, body));
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    expect(v.warnings[0]).toMatch(/among the 2 that were/);   // REAL + IMP checked; OLD unchecked; hyperliquid unscorable
  });
  it("R2-4: a failed holders tiebreak on a 0-labelled top candidate abstains with a retry message, not 'nothing labelled'", async () => {
    const c = fakeClient((ep, body) => {
      if (ep === "search/general") return searchTokens([{ chain: "base", address: OLD }]);
      if (ep === "tgm/flow-intelligence") return flowRow({ exchange_net_flow_usd: 4_310 });
      if (ep === "tgm/token-information") return infoRow({ deployed: "2024-08-10 00:00:00", holders: 11_225 });
      return new Response("slow", { status: 503 });
    });
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    expect(v.abstained).toBe(true);
    expect(v.abstainReason).toMatch(/holders lookup failed .* retry/);
  });
});
