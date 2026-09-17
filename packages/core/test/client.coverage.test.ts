import { describe, it, expect, afterEach } from "vitest";
import { NansenClient, clientFromEnv } from "../src/client.js";

const ORIGINAL_KEY = process.env.NANSEN_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.NANSEN_API_KEY;
  else process.env.NANSEN_API_KEY = ORIGINAL_KEY;
});

describe("RateLimiter burst cap (client.ts:74-75)", () => {
  it("a second call within the same rolling second waits out the remainder before proceeding", async () => {
    const fetchImpl: typeof fetch = async () => new Response('{"ok":1}', { status: 200 });
    // rps: 1 forces the very next call, made immediately after, to hit the "bucket full" branch
    // and await the setTimeout at line 74 instead of returning immediately at line 71-72.
    const c = new NansenClient("nsn_test_key_0000000000000000000000", { fetchImpl, rps: 1 });
    const t0 = Date.now();
    await c.post("tgm/holders", {});
    const t1 = Date.now();
    await c.post("tgm/holders", {});
    const t2 = Date.now();
    // First call takes the free slot immediately.
    expect(t1 - t0).toBeLessThan(500);
    // Second call must wait for the ~1s rolling window to clear (the throttled branch).
    expect(t2 - t1).toBeGreaterThanOrEqual(900);
    expect(c.calls).toHaveLength(2);
  }, 10_000);
});

describe("credit lookup fallback (client.ts:108)", () => {
  it("an endpoint absent from the CREDITS table costs 1 credit", async () => {
    const fetchImpl: typeof fetch = async () => new Response("{}", { status: 200 });
    const c = new NansenClient("nsn_test_key_0000000000000000000000", { fetchImpl, rps: 1000 });
    await c.post("some/unlisted-endpoint", {});
    expect(c.calls[0].credits).toBe(1);
    expect(c.creditsSpent).toBe(1);
  });
});

describe("recordFailure with a non-Error, attempts-less throw (client.ts:128-129)", () => {
  it("a thrown non-Error value is stringified and defaults attempts to 1", async () => {
    // A fetchImpl that rejects with a plain string (not an Error) exercises the
    // `e instanceof Error ? … : String(e)` false branch and the `?.attempts ?? 1`
    // fallback, since withAttempts only annotates object errors.
    const fetchImpl: typeof fetch = async () => {
      throw "network exploded";
    };
    const c = new NansenClient("nsn_test_key_0000000000000000000000", { fetchImpl, rps: 1000 });
    await expect(c.post("tgm/holders", {})).rejects.toBe("network exploded");
    expect(c.calls[0]).toMatchObject({ ok: false, error: "network exploded", attempts: 1, status: 0, credits: 0 });
  });
});

describe("clientFromEnv (client.ts:187-190)", () => {
  it("builds a client from NANSEN_API_KEY when set", () => {
    process.env.NANSEN_API_KEY = "nsn_from_env_0000000000000000000000";
    const c = clientFromEnv();
    expect(c).toBeInstanceOf(NansenClient);
    expect(c.creditsSpent).toBe(0);
  });

  it("falls back to an empty string (and so throws the malformed-key error) when NANSEN_API_KEY is unset", () => {
    delete process.env.NANSEN_API_KEY;
    expect(() => clientFromEnv()).toThrow(/NANSEN_API_KEY/);
  });

  it("passes opts through to the underlying client", () => {
    process.env.NANSEN_API_KEY = "nsn_from_env_0000000000000000000000";
    const fetchImpl: typeof fetch = async () => new Response("{}", { status: 200 });
    const c = clientFromEnv({ fetchImpl, baseUrl: "https://example.test" });
    expect(c).toBeInstanceOf(NansenClient);
  });
});
