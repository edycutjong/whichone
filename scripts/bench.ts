/**
 * Proof numbers for the README: over the fixture queries, cold (no cache) vs warm latency, credits and calls per verdict,
 * failures, and whether the warm hash equals the cold hash. 3 cold runs per query by default.
 *
 *   source ~/.config/nansen/meridian.env && npm run bench            # ~12 × 3 × ≤26 ≈ 900 credits
 *   npm run bench -- --runs 1 PEPE WLFI                               # cheaper subset
 */
import { CachedNansenClient, MemoryCache, whichOnesReal } from "../packages/core/src/index.js";
import { FIXTURE_SET } from "./fixture-set.js";

const argv = process.argv.slice(2);
const runsIdx = argv.indexOf("--runs");
const runs = runsIdx >= 0 ? Number(argv[runsIdx + 1]) : 3;
const wanted = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--runs").map((q) => q.toUpperCase());
const set = FIXTURE_SET.filter((f) => !wanted.length || wanted.includes(f.query.toUpperCase()));
const apiKey = process.env.NANSEN_API_KEY ?? "";

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };

type Row = { query: string; coldMs: number[]; warmMs: number[]; credits: number[]; calls: number[]; failed: number; hashStable: boolean; winner: string };
const rows: Row[] = [];
let liveCalls = 0, liveCredits = 0;

for (const f of set) {
  const row: Row = { query: f.query + (f.chain ? ` --chain ${f.chain}` : ""), coldMs: [], warmMs: [], credits: [], calls: [], failed: 0, hashStable: true, winner: "" };
  let hash: string | undefined;
  for (let i = 0; i < runs; i++) {
    const store = new MemoryCache();
    const client = new CachedNansenClient(apiKey, { store });
    const cold = await whichOnesReal(client, f.query, { chain: f.chain });
    const warm = await whichOnesReal(client, f.query, { chain: f.chain, now: Date.now() });
    row.coldMs.push(cold.ms); row.warmMs.push(warm.ms); row.credits.push(cold.credits);
    const live = cold.provenance.filter((c) => !c.cached);
    row.calls.push(live.length); row.failed += cold.provenance.filter((c) => !c.ok).length;
    liveCalls += live.length; liveCredits += cold.credits;
    // the warm verdict must hash identically to the cold one it was cached from (same day → same ageDays)
    if (warm.hash !== cold.hash) row.hashStable = false;
    if (hash && hash !== cold.hash) row.hashStable = false; // live data can legitimately move between runs; reported, not asserted
    hash = cold.hash;
    row.winner = cold.winner ? `${cold.winner.chain}` : "abstain";
  }
  rows.push(row);
  console.error(`${row.query.padEnd(20)} cold p50 ${pct(row.coldMs, 50)} ms · warm p50 ${pct(row.warmMs, 50)} ms · ${pct(row.credits, 50)} cr · ${row.winner}${row.failed ? ` · ${row.failed} failed calls` : ""}${row.hashStable ? "" : " · hash moved between runs"}`);
}

const allCold = rows.flatMap((r) => r.coldMs), allWarm = rows.flatMap((r) => r.warmMs), allCr = rows.flatMap((r) => r.credits), allCalls = rows.flatMap((r) => r.calls);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
console.log(`## Benchmark — ${new Date().toISOString().slice(0, 16)}Z · ${set.length} queries × ${runs} cold runs · live Nansen API\n`);
console.log(`| query | cold p50 | cold p95 | warm p50 | credits | live calls | failed | winner | warm hash = cold |`);
console.log(`|---|---|---|---|---|---|---|---|---|`);
for (const r of rows) console.log(`| ${r.query} | ${pct(r.coldMs, 50)} ms | ${pct(r.coldMs, 95)} ms | ${pct(r.warmMs, 50)} ms | ${pct(r.credits, 50)} | ${pct(r.calls, 50)} | ${r.failed} | ${r.winner} | ${r.hashStable ? "yes" : "no"} |`);
console.log(`\n**All queries:** cold p50 **${pct(allCold, 50)} ms** · p95 **${pct(allCold, 95)} ms** · warm p50 **${pct(allWarm, 50)} ms** · mean **${mean(allCr).toFixed(1)} credits** and **${mean(allCalls).toFixed(1)} live calls** per verdict · max ${Math.max(...allCr)} credits · ${rows.reduce((n, r) => n + r.failed, 0)} failed calls in ${allCalls.reduce((a, b) => a + b, 0)} · this run spent ${liveCredits} credits over ${liveCalls} live calls.`);
