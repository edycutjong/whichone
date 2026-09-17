import { describe, it, expect } from "vitest";
import { fetchFacts, fetchHolderFacts } from "../src/facts.js";
import type { Candidate } from "../src/search.js";
import { fakeClient, facts, flowRow, infoRow } from "./helpers.js";

const NOW = Date.parse("2026-09-17T00:00:00Z");

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  chain: "ethereum",
  address: "0x" + "1".repeat(40),
  name: "Tok",
  symbol: "TOK",
  ...over,
});

describe("fetchFacts() — flow-intelligence branches", () => {
  it("an empty data[] is treated as evidence (dead token), not a failure: zeros stay, a 'note' is recorded", async () => {
    const c = fakeClient((ep) => (ep === "tgm/flow-intelligence" ? { data: [] } : infoRow()));
    const f = await fetchFacts(c, candidate(), NOW);
    expect(f.errors).toContain("note: flow-intelligence returned no row (no activity in 7d)");
    expect(f.labelledWallets).toBe(0);
    expect(f.smartTraderNetFlowUsd).toBe(0);
    expect(f.exchangeTouched).toBe(false);
    expect(Number.isNaN(f.freshShare)).toBe(true);
  });

  it("a flow-intelligence row that fails FlowResponse's schema is recorded as 'flow-intelligence failed: schema', not silently zeroed", async () => {
    const c = fakeClient((ep) => (ep === "tgm/flow-intelligence" ? { data: "not-an-array" } : infoRow()));
    const f = await fetchFacts(c, candidate(), NOW);
    expect(f.errors).toContain("flow-intelligence failed: schema");
  });

  it("a flow-intelligence rejection with no .message (a bare thrown value) falls back to String(reason) itself", async () => {
    const c = fakeClient((ep) => {
      if (ep === "tgm/flow-intelligence") throw "socket hang up";
      return infoRow();
    });
    const f = await fetchFacts(c, candidate(), NOW);
    expect(f.errors).toContain("flow-intelligence failed: socket hang up");
  });

  it("a flow value that is a number but not finite (JSON exponent overflow → Infinity) is normalised to 0, never propagated", async () => {
    const c = fakeClient((ep) => {
      if (ep === "tgm/flow-intelligence") {
        // 1e400 is valid JSON syntax; JSON.parse overflows it to Infinity — typeof "number" stays true, Number.isFinite() flips false.
        return new Response('{"data":[{"smart_trader_wallet_count":1e400,"exchange_net_flow_usd":500}]}', {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return infoRow();
    });
    const f = await fetchFacts(c, candidate(), NOW);
    expect(f.smartTraderWallets).toBe(0);
    expect(f.labelledWallets).toBe(0);
    expect(f.exchangeNetFlowUsd).toBe(500);
  });
});

describe("fetchFacts() — token-information branches", () => {
  it("a successfully-parsed response whose data is null is 'token-information failed: empty', distinct from a schema failure", async () => {
    const c = fakeClient((ep) => (ep === "tgm/token-information" ? { data: null } : flowRow()));
    const f = await fetchFacts(c, candidate(), NOW);
    expect(f.errors).toContain("token-information failed: empty");
    expect(f.ageDays).toBeUndefined();
  });

  it("a token-information response that fails TokenInfoResponse's schema is 'token-information failed: schema'", async () => {
    const c = fakeClient((ep) => (ep === "tgm/token-information" ? { data: "not-an-object" } : flowRow()));
    const f = await fetchFacts(c, candidate(), NOW);
    expect(f.errors).toContain("token-information failed: schema");
  });

  it("a token-information rejection with no .message (a bare thrown value) falls back to String(reason) itself", async () => {
    const c = fakeClient((ep) => {
      if (ep === "tgm/token-information") throw "dns failure";
      return flowRow();
    });
    const f = await fetchFacts(c, candidate(), NOW);
    expect(f.errors).toContain("token-information failed: dns failure");
  });

  it("null token_details and null spot_metrics fall back through every optional chain: marketCapUsd uses the search-time marketCap, the rest stay undefined", async () => {
    const c = fakeClient((ep) =>
      ep === "tgm/token-information" ? { data: { name: "Tok", symbol: "TOK", logo: null, token_details: null, spot_metrics: null } } : flowRow(),
    );
    const f = await fetchFacts(c, candidate({ marketCap: 4321 }), NOW);
    expect(f.deploymentDate).toBeUndefined();
    expect(f.ageDays).toBeUndefined();
    expect(f.marketCapUsd).toBe(4321); // fell through the nullish `?? base.marketCap`, not the object-nullish `?.` short-circuit
    expect(f.liquidityUsd).toBeUndefined();
    expect(f.totalHolders).toBeUndefined();
    expect(f.uniqueBuyers).toBeUndefined();
  });

  it("present token_details/spot_metrics with every field explicitly null still falls back to undefined/marketCap, distinct from the object being absent", async () => {
    const c = fakeClient((ep) =>
      ep === "tgm/token-information"
        ? {
            data: {
              name: "Tok",
              symbol: "TOK",
              logo: null,
              token_details: { token_deployment_date: null, website: null, x: null, market_cap_usd: null, fdv_usd: null },
              spot_metrics: { volume_total_usd: 0, unique_buyers: null, unique_sellers: 0, liquidity_usd: null, total_holders: null },
            },
          }
        : flowRow(),
    );
    const f = await fetchFacts(c, candidate({ marketCap: 999 }), NOW);
    expect(f.deploymentDate).toBeUndefined();
    expect(f.ageDays).toBeUndefined();
    expect(f.marketCapUsd).toBe(999);
    expect(f.liquidityUsd).toBeUndefined();
    expect(f.totalHolders).toBeUndefined();
    expect(f.uniqueBuyers).toBeUndefined();
  });

  it("a deployment date already in ISO form (no space before the time) skips the space→T rewrite and still parses", async () => {
    const c = fakeClient((ep) => (ep === "tgm/token-information" ? infoRow({ deployed: "2024-01-02T03:04:05Z" }) : flowRow()));
    const f = await fetchFacts(c, candidate(), NOW);
    expect(f.deploymentDate).toBe("2024-01-02T03:04:05Z");
    expect(f.ageDays).toBeGreaterThanOrEqual(0);
  });

  it("a deployment_date string that Date.parse cannot read is kept off ageDays/deploymentDate rather than storing NaN", async () => {
    const c = fakeClient((ep) => (ep === "tgm/token-information" ? infoRow({ deployed: "not-a-real-date" }) : flowRow()));
    const f = await fetchFacts(c, candidate(), NOW);
    expect(f.deploymentDate).toBeUndefined();
    expect(f.ageDays).toBeUndefined();
  });
});

describe("fetchHolderFacts() — holders schema failure", () => {
  it("holders schema failure records 'holders failed: schema' and returns the candidate unmodified, without touching recognisedHolders/topLabels", async () => {
    const c = fakeClient((ep) => (ep === "tgm/holders" ? { data: [{ address: 123 }] } : {}));
    const before = facts();
    const out = await fetchHolderFacts(c, before, 20);
    expect(out).toBe(before); // same object returned
    expect(out.errors).toContain("holders failed: schema");
    expect(out.recognisedHolders).toBeUndefined();
    expect(out.topLabels).toBeUndefined();
    expect(out.topHolderPct).toBeUndefined();
  });
});
