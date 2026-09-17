import { describe, it, expect } from "vitest";
import { searchCandidates, sameName, scorable } from "../src/search.js";
import { fakeClient, searchTokens } from "./helpers.js";

describe("searchCandidates()", () => {
  it("sends result_type=token, dedupes chain+address (case-insensitive), sorts by rank", async () => {
    let sent: Record<string, unknown> = {};
    const c = fakeClient((ep, body) => {
      sent = body;
      return searchTokens([
        { chain: "base", address: "0xABC", rank: 5 },
        { chain: "ethereum", address: "0x1", rank: 2 },
        { chain: "base", address: "0xabc", rank: 9 },
      ]);
    });
    const out = await searchCandidates(c, " PEPE ");
    expect(sent).toMatchObject({ search_query: "PEPE", result_type: "token", limit: 50 });
    expect(out.map((x) => x.chain)).toEqual(["ethereum", "base"]);
    expect(c.calls[0].credits).toBe(0);
  });
  it("passes an optional chain filter and cap", async () => {
    let sent: Record<string, unknown> = {};
    const c = fakeClient((_e, body) => {
      sent = body;
      return searchTokens([
        { chain: "base", address: "0x1" },
        { chain: "base", address: "0x2" },
      ]);
    });
    const out = await searchCandidates(c, "PEPE", { chain: "base", cap: 1 });
    expect(sent.chain).toBe("base");
    expect(out).toHaveLength(1);
  });
  it("sameName matches symbol or name, case-insensitive; scorable excludes hyperliquid", () => {
    expect(sameName("pepe", { chain: "x", address: "a", name: "Pepe", symbol: "PEPE" })).toBe(true);
    expect(sameName("pepe", { chain: "x", address: "a", name: "Pepe Fork", symbol: "PEPEF" })).toBe(false);
    expect(scorable({ chain: "hyperliquid", address: "a", name: "", symbol: "" })).toBe(false);
    expect(scorable({ chain: "solana", address: "a", name: "", symbol: "" })).toBe(true);
  });
  it("tolerates an empty search (no token by that name)", async () => {
    const c = fakeClient(() => ({ tokens: [], entities: [], total_results: 0 }));
    expect(await searchCandidates(c, "XQZPLM")).toEqual([]);
  });
});
