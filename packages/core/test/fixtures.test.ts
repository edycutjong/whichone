import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CachedNansenClient, MemoryCache } from "../src/cache.js";
import { whichOnesReal } from "../src/verdict.js";
import { writeFixture, readFixture, listFixtures, fixtureStore, fixtureName, type Fixture } from "../src/fixtures.js";
import { pepeRoutes, PEPE_IMP } from "./helpers.js";

const KEY = "nsn_test_key_0000000000000000000000";
const NOW = Date.parse("2026-09-16T12:00:00Z");

/** A live-shaped client: fake network, empty memory store — exactly what scripts/seed.ts builds per fixture. */
function liveClient(store: MemoryCache, hits: { n: number }) {
  const fetchImpl: typeof fetch = async (url, init) => {
    hits.n++;
    const out = pepeRoutes(String(url).replace("https://api.nansen.ai/api/v1/", ""), JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify(out), { status: 200 });
  };
  return new CachedNansenClient(KEY, { fetchImpl, rps: 1000, store });
}

describe("fixtures: record live, replay offline", () => {
  it("round-trips through disk and reproduces the decision hash with zero network calls (the verify.ts contract)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "whichone-fx-"));
    try {
      const store = new MemoryCache();
      const hits = { n: 0 };
      const verdict = await whichOnesReal(liveClient(store, hits), "PEPE", { now: NOW });
      expect(hits.n).toBeGreaterThan(0);
      const fx: Fixture = {
        edge: "test",
        query: "PEPE",
        options: {},
        now: NOW,
        recordedAt: new Date(NOW).toISOString(),
        live: { calls: hits.n, credits: verdict.credits, ms: 0 },
        responses: store.entries(),
        verdict,
      };
      const path = writeFixture(fx, dir);
      expect(listFixtures(dir)).toEqual([path]);

      const back = readFixture(path);
      const offlineHits = { n: 0 };
      const replayClient = new CachedNansenClient(KEY, {
        fetchImpl: async () => {
          offlineHits.n++;
          throw new Error("network!");
        },
        store: fixtureStore(back),
        offline: true,
      });
      // a week later, same recorded clock → same ageDays → same hash
      const replay = await whichOnesReal(replayClient, back.query, { ...back.options, now: back.now });
      expect(offlineHits.n).toBe(0);
      expect(replay.hash).toBe(verdict.hash);
      expect(replay.credits).toBe(0);
      expect(replay.provenance.every((c) => c.cached)).toBe(true);
      expect(replay.ranked.map((s) => [s.address, s.score, s.impostor])).toEqual(verdict.ranked.map((s) => [s.address, s.score, s.impostor]));
      expect(replay.winner?.reasons).toEqual(verdict.winner?.reasons);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("replaying under a different clock changes age-dependent output — which is why the fixture records `now`", async () => {
    const store = new MemoryCache();
    const verdict = await whichOnesReal(liveClient(store, { n: 0 }), "PEPE", { now: NOW });
    const later = await whichOnesReal(new CachedNansenClient(KEY, { store, offline: true }), "PEPE", { now: NOW + 30 * 86_400_000 });
    const imp = (v: typeof verdict) => v.ranked.find((s) => s.address === PEPE_IMP)!;
    expect(imp(verdict).reasons).toContain("deployed 3d ago");
    expect(imp(later).reasons).not.toContain("deployed 3d ago");
  });
  it("names fixtures by query and chain filter, filesystem-safe", () => {
    expect(fixtureName("pepe")).toBe("PEPE");
    expect(fixtureName("PEPE", "base")).toBe("PEPE--base");
    expect(fixtureName("a/b c")).toBe("A_B_C");
  });
});
