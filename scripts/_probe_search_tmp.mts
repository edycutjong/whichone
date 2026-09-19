import { clientFromEnv, searchCandidates, sameName } from "../packages/core/src/index.js";
const c = clientFromEnv({ rps: 4 });
for (const q of process.argv.slice(2)) {
  try {
    const all = await searchCandidates(c, q);
    const same = all.filter((x) => sameName(q, x));
    console.log(q.padEnd(10), `${same.length} same-name of ${all.length}`, same.slice(0, 8).map((x) => `${x.chain}:${x.symbol}`).join(" "));
  } catch (e) { console.log(q, "ERR", (e as Error).message.slice(0, 80)); }
}
console.log("credits", c.creditsSpent);
