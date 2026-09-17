import { describe, it, expect } from "vitest";
import { searchCandidates } from "../src/search.js";
import { fakeClient } from "./helpers.js";

// Coverage gap: the existing search.test.ts suite only exercises tokens where market_cap,
// volume_24h and rank are always present, so the `?? undefined` fallback on each of those
// fields (and the `?? 1e9` fallback in the rank comparator) never fires. Nansen's search API
// legitimately omits these for thin/unranked tokens, so the fallbacks are real code paths.
describe("searchCandidates() — missing optional fields", () => {
  it("maps null market_cap, volume_24h and rank to undefined on the candidate", async () => {
    const c = fakeClient(() => ({
      tokens: [
        {
          name: "Thin",
          symbol: "THIN",
          chain: "base",
          address: "0x" + "1".repeat(40),
          price: null,
          volume_24h: null,
          market_cap: null,
          rank: null,
        },
      ],
      entities: [],
      total_results: 1,
    }));
    const [out] = await searchCandidates(c, "THIN");
    expect(out.marketCap).toBeUndefined();
    expect(out.volume24h).toBeUndefined();
    expect(out.searchRank).toBeUndefined();
  });

  it("sorts unranked (rank-less) tokens after every ranked token, regardless of which side of the comparison they land on", async () => {
    // Mix of defined and null ranks, interleaved, so the (a.searchRank ?? 1e9) / (b.searchRank ?? 1e9)
    // fallback fires with the unranked candidate on both the left and the right of a comparison.
    const c = fakeClient(() => ({
      tokens: [
        { name: "Two", symbol: "TWO", chain: "base", address: "0x" + "2".repeat(40), rank: 2 },
        { name: "Unranked1", symbol: "UR1", chain: "base", address: "0x" + "3".repeat(40), rank: null },
        { name: "One", symbol: "ONE", chain: "base", address: "0x" + "4".repeat(40), rank: 1 },
        { name: "Unranked2", symbol: "UR2", chain: "base", address: "0x" + "5".repeat(40), rank: null },
      ],
      entities: [],
      total_results: 4,
    }));
    const out = await searchCandidates(c, "x");
    // Ranked candidates come first, in rank order; both unranked ones trail (fallback 1e9), order between
    // them undefined by the sort but both must be present at the end.
    expect(out.map((x) => x.symbol)).toEqual(["ONE", "TWO", "UR1", "UR2"]);
  });
});
