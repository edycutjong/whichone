/**
 * Replay every fixture OFFLINE and prove the engine is deterministic: same responses + same clock → same decision hash,
 * same ranking, same winner, zero network calls, zero credits. Exit 1 on any mismatch.
 *
 *   npm run verify                # NANSEN_OFFLINE is forced; no API key needed
 */
import { CachedNansenClient, whichOnesReal, listFixtures, readFixture, fixtureStore, type Verdict } from "../packages/core/src/index.js";

process.env.NANSEN_OFFLINE = "1";
const files = listFixtures();
if (files.length === 0) { console.error("no fixtures/ — run `npm run seed` first"); process.exit(1); }

/** The parts of a verdict a replay must reproduce exactly. Cost, timing and cache metadata are excluded by design. */
function projection(v: Verdict) {
  return {
    hash: v.hash, query: v.query, chainFilter: v.chainFilter ?? null, abstained: v.abstained, abstainReason: v.abstainReason ?? null,
    stablecoin: v.stablecoin, candidatesTotal: v.candidatesTotal, warnings: v.warnings,
    winner: v.winner ? `${v.winner.chain}:${v.winner.address}` : null,
    ranked: v.ranked.map((s) => ({ id: `${s.chain}:${s.address}`, score: s.scorable && !s.unchecked ? s.score : null, impostor: s.impostor, unchecked: s.unchecked, reasons: s.reasons, terms: s.terms })),
  };
}

let ok = 0;
const failures: string[] = [];
for (const path of files) {
  const f = readFixture(path);
  const client = new CachedNansenClient("nsn_offline_replay_000000000000000", { store: fixtureStore(f), offline: true });
  const problems: string[] = [];
  let replay: Verdict | undefined;
  try { replay = await whichOnesReal(client, f.query, { ...f.options, now: f.now }); }
  catch (e) { problems.push(`threw: ${(e as Error).message.slice(0, 120)}`); }

  if (replay) {
    const want = JSON.stringify(projection(f.verdict)), got = JSON.stringify(projection(replay));
    if (replay.hash !== f.verdict.hash) problems.push(`hash ${replay.hash.slice(0, 12)} ≠ recorded ${f.verdict.hash.slice(0, 12)}`);
    if (want !== got) problems.push("ranking/reasons differ from the recorded verdict");
    const network = replay.provenance.filter((c) => !c.cached);
    if (network.length) problems.push(`${network.length} call(s) left the cache: ${network.map((c) => `${c.endpoint}${c.ok ? "" : " (failed)"}`).join(", ")}`);
    if (replay.credits !== 0) problems.push(`${replay.credits} credits spent on a replay`);
    // every raw response the live run used is byte-identical in the file: the hashes the engine recorded must all be present
    const recordedHashes = new Set(f.verdict.provenance.filter((c) => c.ok).map((c) => c.responseHash));
    for (const c of replay.provenance) if (c.ok && !recordedHashes.has(c.responseHash)) problems.push(`${c.endpoint} served a response the live run never saw`);
  }

  const label = `${f.query}${f.options.chain ? ` --chain ${f.options.chain}` : ""}`.padEnd(20);
  if (problems.length === 0) {
    ok++;
    const out = replay!.winner ? `${replay!.winner.chain} ✔` : `abstain (${replay!.abstainReason})`;
    console.log(`✔ ${label} ${replay!.hash.slice(0, 12)}  ${replay!.provenance.length} calls replayed · ${out} · recorded ${f.recordedAt.slice(0, 16)}Z · ${f.edge}`);
  } else {
    failures.push(path);
    console.log(`✖ ${label} ${problems.join("; ")}`);
  }
}
console.log(`\n${ok}/${files.length} verdicts reproduced offline`);
if (failures.length) process.exit(1);
