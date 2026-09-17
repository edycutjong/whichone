import { describe, it, expect } from "vitest";
import { score, rank, unscorable, WEIGHTS, ABSTAIN_THRESHOLD } from "../src/score.js";
import { facts } from "./helpers.js";

describe("score()", () => {
  it("is zero-ish for a candidate with no facts", () => {
    const s = score(facts());
    expect(s.score).toBe(0);
    expect(s.reasons[0]).toBe("0 labelled wallets in 7 days");
    expect(s.reasons).toContain("age unknown");
  });
  it("labelled wallets dominate: 69 labelled beats 400K holders with 0 labelled", () => {
    const real = score(facts({ labelledWallets: 69, smartTraderWallets: 38, topPnlWallets: 26, whaleWallets: 1, publicFigureWallets: 4 }));
    const bigDead = score(facts({ totalHolders: 400_000, liquidityUsd: 1e7 }));
    expect(real.score).toBeGreaterThan(bigDead.score);
  });
  it("never reads market cap, volume or search rank", () => {
    const a = score(facts({ labelledWallets: 5 }));
    const b = score(facts({ labelledWallets: 5, marketCap: 1e12, volume24h: 1e12, searchRank: 1 }));
    expect(a.score).toBe(b.score);
  });
  it("exchange term: $1K floor, log10 above it", () => {
    expect(score(facts({ exchangeNetFlowUsd: 500 })).terms.exchange).toBe(0);
    expect(score(facts({ exchangeNetFlowUsd: -10_000 })).terms.exchange).toBeCloseTo(WEIGHTS.exchange * 1, 2);
    expect(score(facts({ exchangeNetFlowUsd: 1_000_000 })).terms.exchange).toBeCloseTo(WEIGHTS.exchange * 3, 2);
    expect(score(facts({ exchangeNetFlowUsd: 1_895_861 })).reasons).toContain("exchange flow $1.9M");
  });
  it("age penalties: <7d −2, <30d −1, else 0", () => {
    expect(score(facts({ ageDays: 3 })).terms.age).toBe(-WEIGHTS.young7);
    expect(score(facts({ ageDays: 20 })).terms.age).toBe(-WEIGHTS.young30);
    expect(score(facts({ ageDays: 400 })).terms.age).toBe(0);
    expect(score(facts({ ageDays: 400 })).reasons).toContain("1.1y old");
  });
  it("fresh-wallet penalty only when fewer than 3 labelled wallets", () => {
    expect(score(facts({ freshShare: 0.9, labelledWallets: 0 })).terms.fresh).toBeCloseTo(-1.35, 2);
    expect(score(facts({ freshShare: 0.9, labelledWallets: 69 })).terms.fresh).toBe(0);
    expect(score(facts({ freshShare: NaN, labelledWallets: 0 })).terms.fresh).toBe(0);
  });
  it("impostor: 0 labelled AND (young OR tiny), AND no meaningful exchange flow", () => {
    expect(score(facts({ ageDays: 3 })).impostor).toBe(true);
    expect(score(facts({ totalHolders: 368, ageDays: 40 })).impostor).toBe(true);
    expect(score(facts({ totalHolders: 11_225, ageDays: 768 })).impostor).toBe(false);
    expect(score(facts({ ageDays: 3, exchangeNetFlowUsd: 50_000 })).impostor).toBe(false);
    expect(score(facts({ ageDays: 3, labelledWallets: 1 })).impostor).toBe(false);
    expect(score(facts({ ageDays: 3 })).reasons.at(-1)).toMatch(/^IMPOSTOR/);
  });
  it("recognised-holders tiebreak adds only when present, and says what the tags are", () => {
    expect(score(facts({ recognisedHolders: 18, topLabels: ["Token Millionaire ×17", "Liquidity Pool"] })).terms.recognisedHolders).toBeCloseTo(
      WEIGHTS.recognisedHolders * Math.log1p(18),
      2,
    );
    expect(score(facts({ recognisedHolders: 18, topLabels: ["Token Millionaire ×17", "Liquidity Pool"] })).reasons).toContain(
      "18 of top 20 holders tagged by Nansen (Token Millionaire ×17, Liquidity Pool)",
    );
    expect(score(facts()).terms.recognisedHolders).toBe(0);
  });
  it("terms sum to score (rounded)", () => {
    const s = score(facts({ labelledWallets: 21, exchangeNetFlowUsd: 593_866, totalHolders: 94_718, recognisedHolders: 20 }));
    expect(Object.values(s.terms).reduce((a, b) => a + b, 0)).toBeCloseTo(s.score, 1);
  });
  it("rank(): scorable first by score, unscorable last", () => {
    const a = score(facts({ labelledWallets: 1 }));
    const b = score(facts({ labelledWallets: 9 }));
    const u = unscorable(facts({ chain: "hyperliquid" }), "perp");
    expect(rank([u, a, b]).map((s) => (s.chain === "hyperliquid" ? "u" : s.labelledWallets))).toEqual([9, 1, "u"]);
  });
  it("ABSTAIN_THRESHOLD is above a bare small-holder score", () => {
    expect(score(facts({ totalHolders: 50 })).score).toBeLessThan(ABSTAIN_THRESHOLD);
  });
});

describe("structural tags are not evidence (live finding 2026-09-16: dead $36K tokens were crowned on a UniswapV2 pool + deployer tag)", () => {
  it("STRUCTURAL_TAG matches pools, deployers, name-service names, the token contract and burn addresses; not wealth/activity tags", async () => {
    const { STRUCTURAL_TAG } = await import("../src/facts.js");
    for (const t of [
      "UniswapV2",
      "Uniswap V3: PEPE-WETH",
      "PEPE Token Deployer",
      "usedsaga.sol",
      "vitalik.eth",
      "Token Contract",
      "Liquidity Pool",
      "Raydium Pool",
      "Null Address",
      "Burn",
    ])
      expect(STRUCTURAL_TAG.test(t), t).toBe(true);
    for (const t of ["Token Millionaire", "High Activity", "High Balance", "PEPE Whale", "Smart Trader", "Binance", "Fund"])
      expect(STRUCTURAL_TAG.test(t), t).toBe(false);
  });
});
