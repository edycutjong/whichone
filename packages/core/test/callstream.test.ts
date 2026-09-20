import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CachedNansenClient, MemoryCache } from "../src/cache.js";
import type { CallEvent } from "../src/client.js";
import { fakeClient } from "./helpers.js";

// A footgun fix: a real shell with NANSEN_OFFLINE=1 exported must not change what this suite asserts — every
// test below builds its own CachedNansenClient with an explicit `offline` option where it matters, so the
// ambient env is neutralized around each test here too.
const REAL_NANSEN_OFFLINE = process.env.NANSEN_OFFLINE;
beforeEach(() => {
  delete process.env.NANSEN_OFFLINE;
});
afterEach(() => {
  if (REAL_NANSEN_OFFLINE === undefined) delete process.env.NANSEN_OFFLINE;
  else process.env.NANSEN_OFFLINE = REAL_NANSEN_OFFLINE;
});

const KEY = "nsn_test_key_0000000000000000000000";

/**
 * The live call rail on the web page renders `CallEvent`s; the provenance drawer renders `calls`. They must be the same
 * facts: one start + one end per call, in that order, and the `call:end` payload IS the object that lands in `calls`.
 */
describe("call stream (onCall)", () => {
  it("emits call:start before the network is touched and call:end with the very Call object recorded in provenance", async () => {
    const events: CallEvent[] = [];
    let touched = 0;
    const c = fakeClient(
      () => {
        expect(events.at(-1)?.type).toBe("call:start");
        touched++;
        return { ok: true };
      },
      { onCall: (e) => events.push(e) },
    );
    await c.post("tgm/flow-intelligence", { chain: "base", token_address: "0x1", timeframe: "7d" });
    expect(touched).toBe(1);
    expect(events.map((e) => e.type)).toEqual(["call:start", "call:end"]);
    const [start, end] = events as [Extract<CallEvent, { type: "call:start" }>, Extract<CallEvent, { type: "call:end" }>];
    expect(start.seq).toBe(end.seq);
    expect(start.endpoint).toBe("tgm/flow-intelligence");
    expect(start.body).toEqual({ chain: "base", token_address: "0x1", timeframe: "7d" });
    expect(end.call).toBe(c.calls[0]);
    expect(end.call).toMatchObject({ ok: true, cached: false, credits: 1, status: 200 });
  });

  it("a failed call ends with ok:false, 0 credits and the error — never a dangling start", async () => {
    const events: CallEvent[] = [];
    const c = fakeClient(() => new Response("nope", { status: 422 }), { onCall: (e) => events.push(e) });
    await expect(c.post("tgm/holders", { chain: "ethereum", token_address: "0x2" })).rejects.toThrow(/422/);
    expect(events.map((e) => e.type)).toEqual(["call:start", "call:end"]);
    const end = events[1] as Extract<CallEvent, { type: "call:end" }>;
    expect(end.call).toBe(c.calls[0]);
    expect(end.call).toMatchObject({ ok: false, credits: 0, status: 422 });
    expect(end.call.error).toMatch(/422/);
  });

  it("a cache hit still streams start + end, with cached:true and 0 credits; sequence numbers stay unique per client", async () => {
    const events: CallEvent[] = [];
    const store = new MemoryCache();
    const mk = () =>
      new CachedNansenClient(KEY, {
        store,
        rps: 1000,
        fetchImpl: async () => new Response('{"data":1}', { status: 200 }),
        onCall: (e) => events.push(e),
      });
    const a = mk();
    await a.post("tgm/token-information", { chain: "solana", token_address: "So1" });
    await a.post("tgm/token-information", { chain: "solana", token_address: "So1" });
    const seqs = events.filter((e) => e.type === "call:start").map((e) => e.seq);
    expect(seqs).toEqual([1, 2]);
    const ends = events.filter((e): e is Extract<CallEvent, { type: "call:end" }> => e.type === "call:end");
    expect(ends).toHaveLength(2);
    expect(ends[0].call.cached).toBe(false);
    expect(ends[1].call).toMatchObject({ cached: true, credits: 0, ms: 0 });
    expect(ends[1].call).toBe(a.calls[1]);
    // credits the rail sums from call:end events == what the drawer sums from `calls`
    expect(ends.reduce((n, e) => n + e.call.credits, 0)).toBe(a.creditsSpent);
  });

  it("an offline miss is recorded as a failed call (shown, not hidden) and the stream closes it", async () => {
    const events: CallEvent[] = [];
    const c = new CachedNansenClient(KEY, {
      store: new MemoryCache(),
      offline: true,
      fetchImpl: async () => {
        throw new Error("network!");
      },
      onCall: (e) => events.push(e),
    });
    await expect(c.post("search/general", { query: "PEPE" })).rejects.toThrow(/NANSEN_OFFLINE/);
    expect(events.map((e) => e.type)).toEqual(["call:start", "call:end"]);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]).toMatchObject({ ok: false, cached: false, credits: 0 });
  });

  it("a client without an observer behaves exactly as before", async () => {
    const c = fakeClient(() => ({ ok: true }));
    await c.post("search/general", { query: "X" });
    expect(c.calls).toHaveLength(1);
  });
});
