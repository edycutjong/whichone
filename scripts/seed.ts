/**
 * Record the fixture set (specs/seed-data.md): run each query LIVE once, write every raw Nansen response the verdict
 * touched plus the verdict itself to fixtures/<QUERY>.json. Responses are stored byte-for-byte and never edited.
 * `npm run verify` replays them offline and must reproduce every decision hash.
 *
 *   source ~/.config/nansen/meridian.env && npm run seed            # all fixtures (~300 credits)
 *   npm run seed -- PEPE WLFI                                        # a subset
 */
import { CachedNansenClient, MemoryCache, whichOnesReal, writeFixture, type Fixture } from "../packages/core/src/index.js";

/** query → the edge it exercises; chain sets a filter. Numbers follow specs/seed-data.md. */
export const FIXTURE_SET: Array<{ query: string; edge: string; chain?: string }> = [
  { query: "PEPE", edge: "1 · many same-name candidates — the hero; green ethereum, red impostors" },
  { query: "WLFI", edge: "2 · recent, contested; the sort visibly reorders" },
  { query: "USDC", edge: "3 · stablecoin — canonical per chain, no impostor flags" },
  { query: "TRUMP", edge: "4 · cross-chain (solana vs evm) same name" },
  { query: "BONK", edge: "5 · single dominant result — works without a sort beat" },
  { query: "XQZPLM", edge: "6 · zero search results → abstain" },
  { query: "DEGEN", edge: "7 · an impostor with a higher market cap than the winner — score beats market cap" },
  { query: "BABYPEPE", edge: "8 · closest top-2 found live (0.15 pts) — holders tiebreak called on both; a true flow tie is proven in verdict.test.ts" },
  { query: "TURBO", edge: "9 · a candidate with no deployment date — 'age unknown', skipped gracefully" },
  { query: "PEPE", chain: "base", edge: "10 · chain-filtered query — only base cards" },
  { query: "SHIB2", edge: "11 · one dead 3-year-old token, 0 labelled wallets, only a pool + deployer tag among holders → abstain, not green" },
  { query: "DOGE", edge: "12 · large, boring, fast — cache-warm timing baseline" },
];

const wanted = process.argv.slice(2).map((q) => q.toUpperCase());
const set = wanted.length ? FIXTURE_SET.filter((f) => wanted.includes(f.query.toUpperCase())) : FIXTURE_SET;
const apiKey = process.env.NANSEN_API_KEY ?? "";
let totalCredits = 0, totalCalls = 0;

for (const f of set) {
  // A fresh in-memory store per fixture: every response is fetched live and lands in the file, nothing is shared.
  const store = new MemoryCache();
  const client = new CachedNansenClient(apiKey, { store });
  const now = Date.now();
  const verdict = await whichOnesReal(client, f.query, { chain: f.chain, now });
  const live = verdict.provenance.filter((c) => !c.cached && c.ok);
  const failed = verdict.provenance.filter((c) => !c.ok);
  const fixture: Fixture = {
    edge: f.edge, query: f.query, options: { chain: f.chain }, now, recordedAt: new Date(now).toISOString(),
    live: { calls: live.length, credits: verdict.credits, ms: verdict.ms },
    responses: store.entries(), verdict,
  };
  const path = writeFixture(fixture);
  totalCredits += verdict.credits; totalCalls += live.length;
  const outcome = verdict.winner ? `${verdict.winner.chain} ${verdict.winner.address.slice(0, 10)}…` : `ABSTAIN — ${verdict.abstainReason}`;
  console.log(`${f.query.padEnd(8)}${f.chain ? `--${f.chain} ` : ""}→ ${path}  ${verdict.candidatesTotal} cands · ${outcome} · ${verdict.credits} cr / ${live.length} calls / ${(verdict.ms / 1000).toFixed(1)}s · ${verdict.hash.slice(0, 12)}${failed.length ? `  ⚠ ${failed.length} call(s) failed: ${failed.map((c) => `${c.endpoint} ${c.body.chain}`).join(", ")}` : ""}`);
}
console.log(`\n${set.length} fixtures · ${totalCredits} credits · ${totalCalls} live calls`);
