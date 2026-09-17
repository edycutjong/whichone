import { describe, it, expect } from "vitest";
import { whichOnesReal } from "../src/verdict.js";
import { fakeClient, searchTokens, flowRow, infoRow, pepeRoutes, PEPE_REAL, PEPE_IMP } from "./helpers.js";

const NOW = Date.parse("2026-09-16T12:00:00Z");

describe("verdict.ts coverage gaps", () => {
  it("pluralizes the unchecked-candidates warning when more than one candidate could not be checked", async () => {
    const c = fakeClient((ep, body) => {
      const a = String(body.token_address);
      if (ep === "tgm/flow-intelligence" && (a === PEPE_REAL || a === PEPE_IMP)) return new Response("boom", { status: 503 });
      return pepeRoutes(ep, body);
    });
    const v = await whichOnesReal(c, "PEPE", { now: NOW });
    // REAL and IMP both fail their flow lookup -> 2 unchecked; only OLD is checked.
    expect(v.ranked.filter((s) => s.unchecked)).toHaveLength(2);
    expect(v.warnings[0]).toMatch(/^2 candidates could not be checked \(Nansen lookup failed\) — the verdict is among the 1 that were$/);
  });

  it("crown rule: with the holders tiebreak skipped (finalists: 0) a 0-labelled top candidate falls back to the ?? 0 default and still abstains below MIN_RECOGNISED_TO_CROWN", async () => {
    const A = "0x" + "4".repeat(40);
    const c = fakeClient((ep, _body) => {
      if (ep === "search/general") return searchTokens([{ chain: "ethereum", address: A, symbol: "OLDCOIN" }]);
      if (ep === "tgm/flow-intelligence") return flowRow({}); // 0 labelled wallets, no exchange flow
      if (ep === "tgm/token-information") return infoRow({ deployed: "2020-01-01 00:00:00", holders: 100_000, liquidity: 1_000_000 });
      // tgm/holders must not be called: finalists: 0 skips the tiebreak entirely.
      throw new Error("unexpected " + ep);
    });
    const v = await whichOnesReal(c, "OLDCOIN", { now: NOW, finalists: 0 });
    const best = v.ranked[0];
    // score is well above ABSTAIN_THRESHOLD purely from holders + liquidity, so the first OR arm is false and the
    // labelledWallets===0 && (recognisedHolders ?? 0) < MIN_RECOGNISED_TO_CROWN arm is what decides the abstain.
    expect(best.score).toBeGreaterThanOrEqual(2.0);
    expect(best.recognisedHolders).toBeUndefined();
    expect(best.labelledWallets).toBe(0);
    expect(v.abstained).toBe(true);
    expect(v.abstainReason).toBe("none of these looks real — nothing labelled has touched any of them");
    expect(v.provenance.some((p) => p.endpoint === "tgm/holders")).toBe(false);
  });
});
