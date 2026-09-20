import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiskCache, MemoryCache, cacheKey, cachedClientFromEnv, CachedNansenClient, type CacheEntry } from "../src/cache.js";

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

const ENTRY = (over: Partial<CacheEntry> = {}): CacheEntry => ({
  storedAt: new Date().toISOString(),
  ttlMs: 1000,
  endpoint: "tgm/holders",
  body: { a: 1 },
  text: '{"v":1}',
  ...over,
});

describe("DiskCache", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("constructor creates the (nested) cache directory recursively when given an explicit dir", () => {
    const root = mkdtempSync(join(tmpdir(), "diskcache-"));
    dirs.push(root);
    const nested = join(root, "does", "not", "exist", "yet");
    expect(existsSync(nested)).toBe(false);
    new DiskCache(nested);
    expect(existsSync(nested)).toBe(true);
  });

  it("falls back to <cwd>/.cache when constructed with no dir argument", () => {
    // Stub process.cwd() rather than actually chdir()'ing — chdir is real OS process state shared
    // with every other worker thread running tests concurrently in this repo; a spy is thread-local.
    const root = mkdtempSync(join(tmpdir(), "diskcache-cwd-"));
    dirs.push(root);
    const spy = vi.spyOn(process, "cwd").mockReturnValue(root);
    try {
      new DiskCache();
      expect(existsSync(join(root, ".cache"))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("get() returns undefined for a key that was never set", () => {
    const root = mkdtempSync(join(tmpdir(), "diskcache-"));
    dirs.push(root);
    const c = new DiskCache(root);
    expect(c.get("missing-key")).toBeUndefined();
  });

  it("set() then get() round-trips a CacheEntry through disk", () => {
    const root = mkdtempSync(join(tmpdir(), "diskcache-"));
    dirs.push(root);
    const c = new DiskCache(root);
    const entry = ENTRY({ endpoint: "tgm/token-information" });
    c.set("k1", entry);
    expect(existsSync(join(root, "k1.json"))).toBe(true);
    expect(c.get("k1")).toEqual(entry);
  });

  it("get() returns undefined (not a throw) when the file on disk is not valid JSON", () => {
    const root = mkdtempSync(join(tmpdir(), "diskcache-"));
    dirs.push(root);
    const c = new DiskCache(root);
    writeFileSync(join(root, "corrupt.json"), "{not valid json");
    expect(c.get("corrupt")).toBeUndefined();
  });

  it("writes exactly JSON.stringify(entry) with no extra formatting", () => {
    const root = mkdtempSync(join(tmpdir(), "diskcache-"));
    dirs.push(root);
    const c = new DiskCache(root);
    const entry = ENTRY();
    c.set("k2", entry);
    expect(readFileSync(join(root, "k2.json"), "utf8")).toBe(JSON.stringify(entry));
  });
});

describe("canonicalize / cacheKey over arrays", () => {
  it("recurses into array elements (array order is preserved, unlike object keys)", () => {
    // A body whose only nesting is an array exercises canonicalize's Array.isArray(v) branch,
    // which a plain-object/pagination body (used elsewhere) never reaches.
    const a = cacheKey("tgm/holders", { tags: [{ z: 1, a: 2 }, { m: 3 }] });
    const b = cacheKey("tgm/holders", { tags: [{ a: 2, z: 1 }, { m: 3 }] }); // same array order, keys reordered inside each element
    const c = cacheKey("tgm/holders", { tags: [{ m: 3 }, { z: 1, a: 2 }] }); // elements swapped — array order matters
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("CachedNansenClient: default store", () => {
  it("constructs a DiskCache under <cwd>/.cache when no store is given, without touching the real cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "cachedclient-cwd-"));
    const spy = vi.spyOn(process, "cwd").mockReturnValue(root);
    try {
      const c = new CachedNansenClient(KEY, { fetchImpl: async () => new Response("{}", { status: 200 }), rps: 1000 });
      expect(c).toBeInstanceOf(CachedNansenClient);
      expect(existsSync(join(root, ".cache"))).toBe(true);
    } finally {
      spy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("CachedNansenClient: oldestHit tracking", () => {
  it("keeps the OLDER storedAt when a later cache hit is newer, rather than overwriting it", async () => {
    const store = new MemoryCache();
    const older = ENTRY({ storedAt: new Date(Date.now() - 100_000).toISOString(), endpoint: "tgm/holders", body: { a: 1 } });
    const newer = ENTRY({ storedAt: new Date().toISOString(), endpoint: "tgm/holders", body: { a: 2 } });
    store.set(cacheKey("tgm/holders", { a: 1 }), older);
    store.set(cacheKey("tgm/holders", { a: 2 }), newer);
    const c = new CachedNansenClient(KEY, {
      fetchImpl: async () => new Response("{}", { status: 200 }),
      rps: 1000,
      store,
    });
    await c.post("tgm/holders", { a: 1 }); // older hit first -> oldestHit = older.storedAt
    expect(c.oldestHit).toBe(older.storedAt);
    await c.post("tgm/holders", { a: 2 }); // newer hit second -> must NOT overwrite the older oldestHit
    expect(c.oldestHit).toBe(older.storedAt);
  });
});

describe("CachedNansenClient: credit cost for an unknown endpoint", () => {
  it("charges 1 credit (the CREDITS-table default) for an endpoint absent from the cost table", async () => {
    const store = new MemoryCache();
    const c = new CachedNansenClient(KEY, {
      fetchImpl: async () => new Response('{"ok":true}', { status: 200 }),
      rps: 1000,
      store,
    });
    await c.post("tgm/some-future-endpoint", { a: 1 });
    expect(c.calls[0].credits).toBe(1);
    expect(c.creditsSpent).toBe(1);
  });
});

describe("MemoryCache.entries()", () => {
  it("exposes everything stored, in insertion order, for scripts/seed.ts to dump to a fixture", () => {
    const m = new MemoryCache();
    const e1 = ENTRY({ endpoint: "tgm/holders" });
    const e2 = ENTRY({ endpoint: "tgm/flow-intelligence" });
    m.set("k1", e1);
    m.set("k2", e2);
    expect(m.entries()).toEqual({ k1: e1, k2: e2 });
    expect(Object.keys(m.entries())).toEqual(["k1", "k2"]);
  });
});

describe("cachedClientFromEnv", () => {
  const KEY = "NANSEN_API_KEY";
  const original = process.env[KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("builds a CachedNansenClient from NANSEN_API_KEY when it is set", () => {
    process.env[KEY] = "nsn_test_key_0000000000000000000000";
    const c = cachedClientFromEnv({ store: { get: () => undefined, set: () => {} } });
    expect(c).toBeInstanceOf(CachedNansenClient);
  });

  it("falls back to an empty string (and so throws the client's own validation error) when NANSEN_API_KEY is unset", () => {
    delete process.env[KEY];
    expect(() => cachedClientFromEnv()).toThrow(/NANSEN_API_KEY missing or malformed/);
  });
});
