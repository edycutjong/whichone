/** Pull facts for every same-name candidate of one ticker and print the raw table. Usage: npm run probe -- PEPE */
import { clientFromEnv, searchCandidates, sameName, scorable } from "../packages/core/src/index.js";
import { fetchFacts } from "../packages/core/src/facts.js";
const q = process.argv[2] ?? "PEPE";
const client = clientFromEnv();
const cands = (await searchCandidates(client, q)).filter((c) => sameName(q, c));
const facts = await Promise.all(cands.map((c) => (scorable(c) ? fetchFacts(client, c) : Promise.resolve(null))));
const f = (n?: number) => (n == null || Number.isNaN(n) ? "—" : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(0) + "K" : n.toFixed(n % 1 ? 2 : 0));
console.log(`| chain | address | rank | mc(search) | labelled | ST | Wh | TopPnL | PF | exch flow | fresh flow | ST flow | fresh share | age d | liq | holders | errors |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
cands.forEach((c, i) => {
  const x = facts[i];
  if (!x) { console.log(`| ${c.chain} | ${c.address.slice(0, 10)}… | ${c.searchRank ?? "—"} | ${f(c.marketCap)} | (not scorable) |`); return; }
  console.log(`| ${x.chain} | ${x.address.slice(0, 10)}… | ${x.searchRank ?? "—"} | ${f(x.marketCap)} | **${x.labelledWallets}** | ${x.smartTraderWallets} | ${x.whaleWallets} | ${x.topPnlWallets} | ${x.publicFigureWallets} | ${f(x.exchangeNetFlowUsd)} | ${f(x.freshNetFlowUsd)} | ${f(x.smartTraderNetFlowUsd)} | ${Number.isNaN(x.freshShare) ? "—" : (x.freshShare * 100).toFixed(0) + "%"} | ${x.ageDays == null ? "?" : x.ageDays.toFixed(0)} | ${f(x.liquidityUsd)} | ${f(x.totalHolders)} | ${x.errors.join("; ")} |`);
});
console.log(`\ncalls: ${client.calls.length} · credits: ${client.creditsSpent}`);
