# Nansen API — developer-experience report from this build

What we hit, in the order we hit it, with the fix we used. Everything here was verified live on 2026-09-16 against `https://api.nansen.ai/api/v1` with a Pro key.

## Things that cost us time

| # | Surprise | Where | What we did |
|---|---|---|---|
| 1 | `tgm/token-information` returns 422 "Missing field" without `timeframe`, although the OpenAPI schema marks it optional | facts.ts | always send `timeframe: "7d"` |
| 2 | `exchange_wallet_count` and `fresh_wallets_wallet_count` in `tgm/flow-intelligence` are always 0 — the response `warnings` say these classes are not counted | facts.ts | use `exchange_net_flow_usd` / `fresh_wallets_net_flow_usd` instead; wallet counts only for smart_trader / whale / top_pnl / public_figure |
| 3 | `search/general` returns perp venues (`hyperliquid`, `arc`) as chains; `tgm/flow-intelligence` rejects them | search.ts | `SCORABLE_CHAINS` allowlist from the OpenAPI enum; those rows are shown as "perp market, not a token contract" |
| 4 | Search rank puts the perp market first for WLFI, TRUMP, DOGE… | score.ts | search rank is never a scoring input |
| 5 | `tgm/position-intelligence` sounded like a risk score; it is perp long/short positioning only | — | dropped; `tgm/indicators` would be the risk source |
| 6 | Non-premium `address_label` on `tgm/holders` is wealth/activity tags ("Token Millionaire", "High Activity", "<X> Whale") and structural ones ("UniswapV2", "<X> Token Deployer", ENS/SNS names) — not exchange/fund entities (those are the 150-credit tier) | facts.ts | term renamed `recognisedHolders`; structural tags excluded; weight kept low; the actual tags are printed on the card |
| 7 | Latency swings by the minute: the same PEPE query took 3.6 s at 12:00 UTC and 7.1 s at 13:50 UTC; `tgm/token-information` and `tgm/holders` on very large tokens (USDC, DOGE on solana) sometimes exceed 6 s | client.ts | 6 s timeout + 1 retry on primary calls, 4–5 s and no retry on secondary calls; failures are recorded in provenance and shown in red, never hidden |
| 8 | An empty `data: []` from flow-intelligence is a real answer (no activity in 7 days), indistinguishable at first from a failure | facts.ts | treated as evidence (zeros) with a note; only schema/HTTP errors mark a candidate "could not check" |
| 9 | `token_deployment_date` is a naive `YYYY-MM-DD HH:MM:SS` string (no timezone); missing for some chains (bnb, arc) | facts.ts | parsed as UTC; `ageDays` floored for hash stability; "age unknown" reason when absent |

## What worked well

- One header (`apikey`), JSON bodies everywhere, consistent `{data, warnings, pagination}` envelopes — the client is ~120 lines.
- `search/general` at 0 credits is what makes a public "type a ticker" tool possible at all.
- The credits table is honest and predictable: a full verdict is ≤ 26 credits and we could budget the whole build (≈ 2,800 credits) on day one.
- Rate limits never bit us: 8 parallel calls per verdict, no 429 in ~1,500 calls.

## Wishes

1. `timeframe` required → say so in the schema (or default it).
2. A `labelled_wallet_count` total on flow-intelligence, or per-class counts for exchange/fresh, so the wallet-count fields are either all populated or not present.
3. A `chain_type` (spot / perp) on search results, so clients don't need a hand-maintained allowlist.
4. A cheap (1–5 credit) "is this address an exchange / fund / contract" boolean, separate from the 100-credit full label set — half the tools in this buildathon want exactly that bit.
5. Server-side `Retry-After` on slow responses would let clients distinguish "busy" from "this token is huge".
