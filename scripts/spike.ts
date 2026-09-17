/**
 * Day-one spike (specs/spec.md → "Risks and the day-one spike"):
 * does `search/general` return MANY same-name tokens per ticker, or only the canonical one?
 * Writes a markdown table to stdout; 0 credits (search is free).
 *
 *   source ~/.config/nansen/meridian.env && npm run spike
 */
import { clientFromEnv, searchCandidates, sameName } from "../packages/core/src/index.js";

const TICKERS = process.argv[2]
  ? process.argv.slice(2)
  : [
      "PEPE",
      "WLFI",
      "TRUMP",
      "DOGE",
      "SHIB",
      "BONK",
      "WIF",
      "PENGU",
      "VIRTUAL",
      "USDC",
      "FLOKI",
      "BRETT",
      "MOG",
      "POPCAT",
      "SPX",
      "AI16Z",
      "FARTCOIN",
      "PNUT",
      "GOAT",
      "TURBO",
      "NEIRO",
      "MEW",
      "TOSHI",
      "DEGEN",
      "PUMP",
    ];

const client = clientFromEnv();
const rows: { q: string; total: number; same: number; chains: string; top: string; youngestFlag: string }[] = [];

for (const q of TICKERS) {
  const t0 = Date.now();
  try {
    const all = await searchCandidates(client, q);
    const same = all.filter((c) => sameName(q, c));
    const chains = [...new Set(same.map((c) => c.chain))].sort().join(",");
    const top = same[0] ? `${same[0].chain} ${same[0].address.slice(0, 6)}… mc=${fmt(same[0].marketCap)}` : "—";
    rows.push({ q, total: all.length, same: same.length, chains, top, youngestFlag: `${Date.now() - t0}ms` });
  } catch (e) {
    rows.push({ q, total: -1, same: -1, chains: "ERR", top: String((e as Error).message).slice(0, 60), youngestFlag: "" });
  }
}

function fmt(n?: number) {
  return n == null
    ? "?"
    : n >= 1e9
      ? (n / 1e9).toFixed(1) + "B"
      : n >= 1e6
        ? (n / 1e6).toFixed(1) + "M"
        : n >= 1e3
          ? (n / 1e3).toFixed(0) + "K"
          : String(Math.round(n));
}
const sameCounts = rows
  .filter((r) => r.same >= 0)
  .map((r) => r.same)
  .sort((a, b) => a - b);
const median = sameCounts.length ? sameCounts[Math.floor(sameCounts.length / 2)] : 0;

console.log(`| ticker | results | same-name | chains | top by rank | ms |`);
console.log(`|---|---|---|---|---|---|`);
for (const r of rows) console.log(`| ${r.q} | ${r.total} | ${r.same} | ${r.chains} | ${r.top} | ${r.youngestFlag} |`);
console.log(
  `\nmedian same-name candidates: **${median}** · tickers with ≥3 same-name: ${sameCounts.filter((n) => n >= 3).length}/${sameCounts.length} · with 0: ${sameCounts.filter((n) => n === 0).length}`,
);
console.log(`calls: ${client.calls.length} · credits: ${client.creditsSpent}`);
