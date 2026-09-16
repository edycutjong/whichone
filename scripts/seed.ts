/**
 * Record the fixture set (specs/seed-data.md): run each query LIVE once, write every raw Nansen response the verdict
 * touched plus the verdict itself to fixtures/<QUERY>.json. Responses are stored byte-for-byte and never edited.
 * `npm run verify` replays them offline and must reproduce every decision hash.
 *
 *   source ~/.config/nansen/meridian.env && npm run seed            # all fixtures (~300 credits)
 *   npm run seed -- PEPE WLFI                                        # a subset
 */
import { CachedNansenClient, MemoryCache, whichOnesReal, writeFixture, type Fixture } from "../packages/core/src/index.js";
import { FIXTURE_SET } from "./fixture-set.js";

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
