import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryCache, type CacheEntry } from "./cache.js";
import type { Verdict, VerdictOptions } from "./verdict.js";

/**
 * A recorded live run: every raw Nansen response the verdict touched (keyed by cache key, byte-for-byte as sent),
 * the verdict it produced, and the clock it ran under. `scripts/seed.ts` writes these; `scripts/verify.ts` and the
 * tests replay them with NANSEN_OFFLINE — same inputs, same clock, so the decision hash must come out identical.
 * Responses are never edited.
 */
export type Fixture = {
  /** why this query is in the set — the edge it exercises (from specs/seed-data.md) */
  edge: string;
  query: string;
  options: Pick<VerdictOptions, "chain" | "cap" | "finalists">;
  /** the `now` the live run used for token age, so a replay a week later still computes the same ageDays */
  now: number;
  recordedAt: string;
  /** live network calls the run made, credits they cost, wall time */
  live: { calls: number; credits: number; ms: number };
  responses: Record<string, CacheEntry>;
  verdict: Verdict;
};

export const FIXTURES_DIR = "fixtures";

/** File name for a fixture: the query, plus the chain filter when one applies. */
export function fixtureName(query: string, chain?: string): string {
  return `${query.toUpperCase()}${chain ? `--${chain}` : ""}`.replace(/[^A-Z0-9_-]/gi, "_");
}

export function writeFixture(f: Fixture, dir = FIXTURES_DIR): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${fixtureName(f.query, f.options.chain)}.json`);
  writeFileSync(path, JSON.stringify(f, null, 2) + "\n");
  return path;
}

export function readFixture(path: string): Fixture {
  return JSON.parse(readFileSync(path, "utf8")) as Fixture;
}

export function listFixtures(dir = FIXTURES_DIR): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort()
      .map((n) => join(dir, n));
  } catch {
    return [];
  }
}

/** A cache store pre-loaded with the fixture's responses — plug into `CachedNansenClient` with `offline: true`. */
export function fixtureStore(f: Fixture): MemoryCache {
  const store = new MemoryCache();
  for (const [key, entry] of Object.entries(f.responses)) store.set(key, entry);
  return store;
}
