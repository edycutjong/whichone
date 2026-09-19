/**
 * Property-based verification of the decision function (fast-check). The example tests in score.test.ts and
 * verdict.test.ts pin specific defects; these run the same rules over the whole input space instead.
 *
 *   RUNS generated cases per property × PROPERTIES properties — the total is the number published in README / JUDGE.md.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { score, unscorable, rank, crown, ABSTAIN_THRESHOLD, MIN_RECOGNISED_TO_CROWN, type Scored } from "../src/index.js";
import type { CandidateFacts } from "../src/facts.js";
import { facts } from "./helpers.js";

export const RUNS = 10_000;
export const PROPERTIES = 5;

const finite = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const maybe = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: undefined });

/** Every field the scorer can read, drawn from ranges wider than anything Nansen has returned. */
const arbFacts: fc.Arbitrary<CandidateFacts> = fc
  .record({
    chain: fc.constantFrom("ethereum", "base", "solana", "bnb", "arbitrum", "polygon", "avalanche"),
    address: fc.string({ unit: fc.constantFrom(..."0123456789abcdef"), minLength: 40, maxLength: 40 }).map((h) => "0x" + h),
    smartTraderWallets: fc.nat(500),
    whaleWallets: fc.nat(500),
    topPnlWallets: fc.nat(500),
    publicFigureWallets: fc.nat(500),
    exchangeNetFlowUsd: finite(-1e10, 1e10),
    freshNetFlowUsd: finite(-1e10, 1e10),
    smartTraderNetFlowUsd: finite(-1e10, 1e10),
    freshShare: fc.oneof(finite(0, 1), fc.constant(NaN)),
    ageDays: maybe(finite(0, 6000)),
    totalHolders: maybe(fc.nat(50_000_000)),
    liquidityUsd: maybe(finite(0, 1e10)),
    recognisedHolders: maybe(fc.nat(20)),
    marketCapUsd: maybe(finite(0, 1e12)),
    uniqueBuyers: maybe(fc.nat(1e6)),
    errors: fc.subarray([
      "flow-intelligence failed: timeout",
      "token-information failed: HTTP 500",
      "holders failed: timeout",
      "note: flow-intelligence returned no row (no activity in 7d)",
    ]),
  })
  .map((r) => facts({ ...r, labelledWallets: r.smartTraderWallets + r.whaleWallets + r.topPnlWallets + r.publicFigureWallets }));

/** A scored candidate as the verdict sees it: scored, or an unscorable perp-market row. */
const arbScored: fc.Arbitrary<Scored> = fc.oneof(
  { weight: 9, arbitrary: arbFacts.map((f) => score(f)) },
  { weight: 1, arbitrary: arbFacts.map((f) => unscorable({ ...f, chain: "hyperliquid" }, "hyperliquid: perp market, not a token contract — not ranked")) },
);

const tier = (s: Scored) => (!s.scorable ? 0 : s.unchecked ? 1 : 2);
const key = (s: Scored) => [tier(s), s.score, s.labelledWallets, s.totalHolders ?? 0];
const ge = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

describe(`property-based verification — ${RUNS.toLocaleString()} generated cases per property, ${PROPERTIES} properties`, () => {
  it("crown rule: no candidate with 0 labelled wallets and fewer than MIN_RECOGNISED_TO_CROWN tagged holders is ever crowned; nor an unchecked or unscorable one; nor a score below ABSTAIN_THRESHOLD; nor an impostor-flagged one", () => {
    fc.assert(
      fc.property(fc.array(arbScored, { maxLength: 10 }), fc.nat(30), fc.string({ minLength: 1, maxLength: 44 }), (list, extra, q) => {
        const ranked = rank(list);
        const { winner, abstainReason } = crown(ranked, list.length + (list.length ? extra : 0), q);
        if (winner === null) return typeof abstainReason === "string" && abstainReason.length > 0;
        return (
          winner === ranked[0] &&
          winner.scorable &&
          !winner.unchecked &&
          winner.score >= ABSTAIN_THRESHOLD &&
          !(winner.labelledWallets === 0 && (winner.recognisedHolders ?? 0) < MIN_RECOGNISED_TO_CROWN) &&
          !winner.impostor &&
          abstainReason === undefined
        );
      }),
      { numRuns: RUNS },
    );
  });

  it("crown rule: an empty candidate set always abstains, and the reason names the query (or explains a pasted address)", () => {
    fc.assert(
      fc.property(fc.array(arbScored, { maxLength: 4 }), fc.string({ minLength: 1, maxLength: 44 }), (list, q) => {
        const { winner, abstainReason } = crown(rank(list), 0, q);
        return winner === null && (abstainReason!.includes(q) || abstainReason!.includes("contract address"));
      }),
      { numRuns: RUNS },
    );
  });

  it("rank() is a total order: a permutation of its input, sorted by (tier, score, labelled wallets, holders) non-increasing, idempotent, and independent of input order", () => {
    fc.assert(
      fc.property(fc.array(arbScored, { maxLength: 12 }), (list) => {
        const ranked = rank(list);
        if (ranked.length !== list.length || !list.every((s) => ranked.includes(s))) return false;
        for (let i = 1; i < ranked.length; i++) if (!ge(key(ranked[i - 1]), key(ranked[i]))) return false;
        const again = rank(ranked);
        const reversed = rank([...list].reverse());
        return ranked.every((s, i) => again[i] === s) && ranked.every((s, i) => JSON.stringify(key(reversed[i])) === JSON.stringify(key(s)));
      }),
      { numRuns: RUNS },
    );
  });

  it("score() never reads market cap, volume, search rank, buyers, logo or website — the fields an impostor can buy", () => {
    fc.assert(
      fc.property(arbFacts, maybe(finite(0, 1e12)), maybe(finite(0, 1e12)), maybe(fc.nat(1000)), maybe(fc.nat(1e6)), (f, mc, vol, rk, buyers) => {
        const a = score(f);
        const b = score({ ...f, marketCapUsd: mc, volume24h: vol, searchRank: rk, uniqueBuyers: buyers, logo: "x", website: "y" });
        return a.score === b.score && a.impostor === b.impostor && a.unchecked === b.unchecked && JSON.stringify(a.terms) === JSON.stringify(b.terms);
      }),
      { numRuns: RUNS },
    );
  });

  it("score() arithmetic: terms sum to the score, labelled wallets never lower it, and IMPOSTOR needs 0 labelled + no exchange flow + (young or tiny)", () => {
    fc.assert(
      fc.property(arbFacts, fc.nat(200), (f, more) => {
        const s = score(f);
        if (s.unchecked) return s.score === Number.NEGATIVE_INFINITY && !s.impostor && s.reasons.length === 1;
        const sum = Object.values(s.terms).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - s.score) > 0.011 * Object.keys(s.terms).length) return false;
        const lifted = score({ ...f, labelledWallets: f.labelledWallets + more, smartTraderWallets: f.smartTraderWallets + more });
        if (lifted.score < s.score - 1e-9) return false;
        const exch = Math.abs(f.exchangeNetFlowUsd);
        const expectImpostor =
          f.labelledWallets === 0 && exch < 10_000 && ((f.ageDays != null && f.ageDays < 14) || (f.totalHolders != null && f.totalHolders < 500));
        return s.impostor === expectImpostor;
      }),
      { numRuns: RUNS },
    );
  });

  it(`publishes the case count: ${(RUNS * PROPERTIES).toLocaleString()} generated cases`, () => {
    expect(RUNS * PROPERTIES).toBe(50_000);
  });
});
