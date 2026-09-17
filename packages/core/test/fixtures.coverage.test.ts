import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CachedNansenClient, MemoryCache } from "../src/cache.js";
import { whichOnesReal } from "../src/verdict.js";
import { writeFixture, listFixtures, fixtureName, FIXTURES_DIR, type Fixture } from "../src/fixtures.js";
import { pepeRoutes } from "./helpers.js";

const KEY = "nsn_test_key_0000000000000000000000";
const NOW = Date.parse("2026-09-16T12:00:00Z");

/** Same shape scripts/seed.ts produces, built with the shared pepeRoutes fake network. */
async function buildFixture(): Promise<Fixture> {
  const store = new MemoryCache();
  const hits = { n: 0 };
  const fetchImpl: typeof fetch = async (url, init) => {
    hits.n++;
    const out = pepeRoutes(String(url).replace("https://api.nansen.ai/api/v1/", ""), JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify(out), { status: 200 });
  };
  const client = new CachedNansenClient(KEY, { fetchImpl, rps: 1000, store });
  const verdict = await whichOnesReal(client, "PEPE", { now: NOW });
  return {
    edge: "coverage: default-dir params",
    query: "PEPE",
    options: {},
    now: NOW,
    recordedAt: new Date(NOW).toISOString(),
    live: { calls: hits.n, credits: verdict.credits, ms: 0 },
    responses: store.entries(),
    verdict,
  };
}

describe("fixtures: missing-directory replay and default `dir` parameters", () => {
  it("listFixtures on a directory that doesn't exist swallows the ENOENT from readdirSync and returns []", () => {
    const dir = mkdtempSync(join(tmpdir(), "whichone-fx-missing-"));
    rmSync(dir, { recursive: true, force: true }); // dir is gone — readdirSync(dir) now throws
    expect(listFixtures(dir)).toEqual([]);
  });

  it("writeFixture and listFixtures both fall back to FIXTURES_DIR ('fixtures') relative to cwd when no dir is passed", async () => {
    const fx = await buildFixture();
    const cwd = process.cwd();
    const tmp = mkdtempSync(join(tmpdir(), "whichone-fx-cwd-"));
    process.chdir(tmp);
    try {
      // the default fixtures/ dir doesn't exist yet under the fresh tmp cwd — also exercises the catch branch
      expect(listFixtures()).toEqual([]);

      const path = writeFixture(fx);
      expect(path).toBe(join(FIXTURES_DIR, `${fixtureName(fx.query, fx.options.chain)}.json`));
      expect(existsSync(path)).toBe(true);
      expect(listFixtures()).toEqual([path]);
    } finally {
      process.chdir(cwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
