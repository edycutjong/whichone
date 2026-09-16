#!/usr/bin/env -S npx tsx
import { cachedClientFromEnv, whichOnesReal, type Verdict } from "@whichone/core";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const chainIdx = args.indexOf("--chain");
const chain = chainIdx >= 0 ? args[chainIdx + 1] : undefined;
const query = positional.find((p) => p !== chain);

if (!query || flags.has("--help")) {
  console.log(`usage: whichone <ticker> [--chain <chain>] [--json] [--explain] [--no-cache]
  Type a ticker. Every same-name token across chains, ranked by who actually holds and trades it.
  Needs NANSEN_API_KEY (source ~/.config/nansen/meridian.env).`);
  process.exit(query ? 0 : 1);
}

const client = cachedClientFromEnv({ ttlMs: flags.has("--no-cache") ? 0 : undefined });
const v: Verdict = await whichOnesReal(client, query, { chain });

if (flags.has("--json")) { console.log(JSON.stringify(v, null, 2)); process.exit(0); }

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const pad = (s: string, n: number) => s.padEnd(n);

console.log(`\n${B}${v.query}${X} — ${v.candidatesTotal} same-name token${v.candidatesTotal === 1 ? "" : "s"} on Nansen${v.stablecoin ? " (stablecoin: canonical per chain)" : ""}\n`);
for (const s of v.ranked) {
  const isWin = v.winner && s.chain === v.winner.chain && s.address === v.winner.address;
  const mark = isWin ? `${G}✔` : s.impostor ? `${R}✖` : s.unchecked ? `${D}?` : `${D}·`;
  const tag = isWin ? `${G}${B}← REAL${X}` : s.impostor ? `${R}IMPOSTOR${X}` : "";
  const scoreStr = s.scorable ? s.score.toFixed(2) : "  —  ";
  console.log(`${mark} ${pad(s.chain, 10)} ${pad(short(s.address), 14)} ${pad(s.symbol, 8)} ${pad(scoreStr, 6)} ${s.reasons.slice(0, 3).join(" · ")} ${tag}${X}`);
  if (flags.has("--explain") && s.scorable) console.log(`${D}    terms: ${Object.entries(s.terms).map(([k, t]) => `${k}=${t}`).join("  ")}${X}`);
}
for (const w of v.warnings) console.log(`${D}⚠ ${w}${X}`);
if (v.abstained) console.log(`\n${R}${B}no winner${X} — ${v.abstainReason}`);
else console.log(`\n${G}${B}${v.winner!.chain} ${v.winner!.address}${X}`);
const hits = v.provenance.filter((c) => c.cached).length;
const retried = v.provenance.filter((c) => c.ok && c.attempts > 1).length;
const failed = v.provenance.filter((c) => !c.ok);
for (const f of failed) console.log(`${R}✗ ${f.endpoint} ${f.body.chain ?? ""} — ${f.error} (${(f.totalMs / 1000).toFixed(1)}s)${X}`);
console.log(`${D}${v.credits} credits · ${v.provenance.length} calls (${hits} cached${client.oldestHit ? `, as of ${client.oldestHit.slice(11, 16)} UTC` : ""}) ${retried ? ` · ${retried} retried` : ""} · ${(v.ms / 1000).toFixed(1)}s · verdict ${v.hash.slice(0, 12)}${X}`);
if (flags.has("--explain")) console.log(`${D}weights: ${JSON.stringify(v.weights)}${X}`);
