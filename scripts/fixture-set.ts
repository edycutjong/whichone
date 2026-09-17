/** The fixture queries and the edge each exercises (specs/seed-data.md). Shared by seed.ts and bench.ts. */
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
