/**
 * Regression tests for the 2026-09-23 audit — each named for the defect it pins.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NansenClient, type CallEvent } from "../src/client.js";
import { CachedNansenClient, MemoryCache, cacheKey, type CacheEntry, type CacheStore } from "../src/cache.js";
import { searchCandidates } from "../src/search.js";
import { fakeClient, flowRow } from "./helpers.js";
import { permalinkVerdict, resetGuard, recordSpend, ipAllowed, creditsLeft, IP_PER_MIN, DAILY_CREDITS } from "@/lib/guard";

const KEY = "nsn_test_key_0000000000000000000000";
const html = () => new Response("<html>Just a moment…</html>", { status: 200 });

// the ambient shell must not change what these assert (see cache.test.ts)
const REAL_OFFLINE = process.env.NANSEN_OFFLINE;
beforeEach(() => {
  delete process.env.NANSEN_OFFLINE;
});
afterEach(() => {
  if (REAL_OFFLINE === undefined) delete process.env.NANSEN_OFFLINE;
  else process.env.NANSEN_OFFLINE = REAL_OFFLINE;
});

describe("A1: a 200 with a non-JSON body (gateway / challenge page) is one failed call", () => {
  it("base client: recorded once, ok:false, 0 credits — not a success followed by a failure for the same call", async () => {
    const ends: CallEvent[] = [];
    const c = new NansenClient(KEY, { rps: 1000, fetchImpl: async () => html(), onCall: (e) => e.type === "call:end" && ends.push(e) });
    await expect(c.post("tgm/holders", { a: 1 })).rejects.toThrow(/not JSON/);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]).toMatchObject({ ok: false, credits: 0, status: 200 });
    expect(ends).toHaveLength(1);
  });

  it("cached client: never written to the cache, so the next identical call goes back to the network instead of replaying the page for 30 min", async () => {
    const store = new MemoryCache();
    let n = 0;
    const fetchImpl: typeof fetch = async () => (n++ === 0 ? html() : new Response('{"data":[]}', { status: 200 }));
    const c = new CachedNansenClient(KEY, { rps: 1000, store, fetchImpl });
    await expect(c.post("tgm/holders", { a: 1 })).rejects.toThrow(/not JSON/);
    expect(Object.keys(store.entries())).toHaveLength(0);
    expect(c.calls[0]).toMatchObject({ ok: false, credits: 0 });
    expect(await c.post("tgm/holders", { a: 1 })).toEqual({ data: [] });
    expect(n).toBe(2);
    expect(c.calls[1]).toMatchObject({ ok: true, cached: false, credits: 5 });
  });

  it("an unparseable entry already in the cache is a miss, not a crash: live refetch; offline it is the recorded miss", async () => {
    const store = new MemoryCache();
    const bad: CacheEntry = { storedAt: new Date().toISOString(), ttlMs: 1e9, endpoint: "tgm/holders", body: { a: 1 }, text: "<html>" };
    store.set(cacheKey("tgm/holders", { a: 1 }), bad);
    let n = 0;
    const live = new CachedNansenClient(KEY, {
      rps: 1000,
      store,
      fetchImpl: async () => {
        n++;
        return new Response('{"v":1}', { status: 200 });
      },
    });
    expect(await live.post("tgm/holders", { a: 1 })).toEqual({ v: 1 });
    expect(n).toBe(1);
    expect(live.calls[0].cached).toBe(false);

    store.set(cacheKey("tgm/holders", { a: 1 }), bad);
    const off = new CachedNansenClient(KEY, { store, offline: true });
    await expect(off.post("tgm/holders", { a: 1 })).rejects.toThrow(/NANSEN_OFFLINE/);
    expect(off.calls[0]).toMatchObject({ ok: false, credits: 0 });
  });
});

describe("A2: a cache that cannot be written does not throw away a paid response", () => {
  it("store.set throwing (read-only / full disk) still returns the data, recorded as a live call", async () => {
    const store: CacheStore = {
      get: () => undefined,
      set: () => {
        throw new Error("EROFS: read-only file system");
      },
    };
    const c = new CachedNansenClient(KEY, { rps: 1000, store, fetchImpl: async () => new Response('{"data":[1]}', { status: 200 }) });
    expect(await c.post("tgm/flow-intelligence", { a: 1 })).toEqual({ data: [1] });
    expect(c.calls[0]).toMatchObject({ ok: true, credits: 1 });
  });
});

describe("A3: one malformed search row does not sink every candidate for the ticker", () => {
  const good = (chain: string, address: string) => ({ name: "Pepe", symbol: "PEPE", chain, address, rank: 1 });
  it("rows failing the schema are skipped; a missing total_results is fine", async () => {
    const c = fakeClient(() => ({
      tokens: [
        good("ethereum", "0x" + "1".repeat(40)),
        { name: null, symbol: "PEPE", chain: "base", address: "0x2" },
        { symbol: "PEPE" },
        good("base", "0x" + "3".repeat(40)),
      ],
    }));
    const out = await searchCandidates(c, "PEPE");
    expect(out.map((x) => x.chain)).toEqual(["ethereum", "base"]);
  });
  it("an envelope with no tokens list is a one-line error, not a schema dump", async () => {
    const c = fakeClient(() => ({ tokens: "nope" }));
    await expect(searchCandidates(c, "PEPE")).rejects.toThrow(/^Nansen search\/general returned an unexpected shape/);
  });
});

describe("A4: the /q permalink runs under the spend guard", () => {
  const fetchSpy = vi.fn<typeof fetch>();
  let savedKey: string | undefined;
  const h = (ip = "198.51.100.9") => new Headers({ "x-forwarded-for": ip });
  beforeEach(() => {
    resetGuard();
    savedKey = process.env.NANSEN_API_KEY;
    process.env.NANSEN_API_KEY = KEY;
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedKey === undefined) delete process.env.NANSEN_API_KEY;
    else process.env.NANSEN_API_KEY = savedKey;
  });

  it("past the per-IP rate: no server-side verdict, zero fetches (the client stream gets the route's 429)", async () => {
    for (let i = 0; i < IP_PER_MIN; i++) ipAllowed("198.51.100.9");
    expect(await permalinkVerdict("PEPE", undefined, h())).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("past the daily ceiling: no server-side verdict, zero fetches, and no rate slot spent", async () => {
    recordSpend(DAILY_CREDITS);
    expect(await permalinkVerdict("PEPE", undefined, h())).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    resetGuard();
    for (let i = 0; i < IP_PER_MIN; i++) expect(ipAllowed("198.51.100.9").ok).toBe(true);
  });

  it("no key: undefined without touching the network", async () => {
    delete process.env.NANSEN_API_KEY;
    expect(await permalinkVerdict("PEPE", undefined, h())).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("under the ceilings it goes live and its credits count against the day's budget", async () => {
    // a query unique to this run, so the local disk cache can never answer it
    const q = `ZQ${Date.now().toString(36).toUpperCase()}`;
    const address = "0x" + "9".repeat(40);
    fetchSpy.mockImplementation(async (url) => {
      const ep = String(url).replace("https://api.nansen.ai/api/v1/", "");
      const body =
        ep === "search/general"
          ? { tokens: [{ name: q, symbol: q, chain: "ethereum", address, rank: 1 }] }
          : ep === "tgm/flow-intelligence"
            ? flowRow({ smart_trader_wallet_count: 20 })
            : ep === "tgm/token-information"
              ? { data: {} }
              : { data: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const v = await permalinkVerdict(q, undefined, h());
    expect(v?.query).toBe(q);
    expect(v?.credits).toBe(7); // flow 1 + info 1 + holders 5
    expect(creditsLeft()).toBe(DAILY_CREDITS - 7);
  });
});
