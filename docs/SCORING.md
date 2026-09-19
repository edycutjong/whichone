# SCORING.md — how Which One's Real ranks same-name tokens

Every term below is a Nansen response field. Nothing reads market cap, 24h volume or search rank — those are exactly what an impostor can buy. The weights live in one object (`packages/core/src/score.ts` → `WEIGHTS`) and are printed in every verdict's provenance drawer and by `whichone <ticker> --explain`.

## The function

```
score = 3.0 · ln(1 + labelled_wallets)                       # smart_trader + whale + top_pnl + public_figure wallet counts, 7d  (tgm/flow-intelligence)
      + 0.6 · max(0, log10|exchange_net_flow_usd| − 3)        # nothing below $1K; $10K → 0.6; $1M → 1.8            (tgm/flow-intelligence)
      + 0.6 · log10(1 + total_holders)                          # breadth                                              (tgm/token-information)
      + 0.4 · log10(1 + liquidity_usd)                          # depth, can be bought → low weight                    (tgm/token-information)
      − 2.0 · [age < 7d]  − 1.0 · [7d ≤ age < 30d]                # token_deployment_date                                (tgm/token-information)
      − 1.5 · fresh_share · [labelled_wallets < 3]              # |fresh net flow| / Σ|net flow|; only when nothing labelled is present
      + 0.8 · ln(1 + recognised_holders)                        # top-20 holders carrying a wealth/activity tag; finalists only (tgm/holders, 5 cr)
                                                                 #   structural tags do NOT count: the token contract, DEX pools, "<X> Token Deployer",
                                                                 #   ENS/SNS names, burn addresses — every token has those (STRUCTURAL_TAG in facts.ts)

IMPOSTOR  = labelled_wallets == 0 ∧ |exchange flow| < $10K ∧ (age < 14d ∨ total_holders < 500)
ABSTAIN   = best.score < 2.0 ∨ (best.labelled_wallets == 0 ∧ best.recognised_holders < 3) ∨ best.IMPOSTOR   → "none of these looks real"
            (a card is never "this is the one" and IMPOSTOR at once — found live on PEPEGA, 2026-09-19: 1 candidate, 0 labelled, 283 holders, 7 tagged top holders)
STABLECOIN (USDC, USDT, DAI, …) = many same-name results are canonical per chain → no impostor flags, header says so
```

Why these shapes: `ln(1+x)` on wallet counts so 69 vs 21 matters but 690 vs 210 barely does; `log10` on holders/liquidity so a bought $100K pool cannot outrun one real labelled cohort; the exchange term has a $1K floor because tiny dead tokens still show a few hundred dollars of router flow; the fresh-wallet penalty is gated on `labelled < 3` because the *real* PEPE has 90% fresh-wallet flow — retail buying a real token is not a red flag, retail being the *only* buyers is.

## Worked example — `PEPE`, live on 2026-09-16 (verdict `9f9cd7b90e7c`, 26 credits cold · 0 on a cached replay, 19 calls)

| candidate | labelled 7d | exchange flow | holders | liquidity | age d | tagged top-20 | terms (labelled + exchange + holders + liquidity + age + fresh + recognisedHolders) | score |
|---|---|---|---|---|---|---|---|---|
| ethereum `0x6982…1933` | 69 | $1,895,907 | 400,392 | $13,803,929 | 1250 | 18 | 12.75 + 1.97 + 3.36 + 2.86 + 0 + 0 + 2.36 | **23.29** |
| bnb `0x25d8…bb00` | 21 | $593,866 | 94,718 | $0 | ? | 20 | 9.27 + 1.66 + 2.99 + 0 + 0 + 0 + 2.44 | **16.36** |
| solana `B5WTLa…2R6B` | 15 | $41,393 | 9,130 | $157,794 | 843 | — | 8.32 + 0.97 + 2.38 + 2.08 + 0 + 0 + 0 | **13.74** |
| base `0x52b4…777d` | 0 | $4,310 | 11,225 | $176,748 | 768 | — | 0 + 0.38 + 2.43 + 2.1 + 0 + 0 + 0 | **4.91** |
| base `0x698d…c233` | 0 | $1,415 | 5,375 | $39,622 | 876 | — | 0 + 0.09 + 2.24 + 1.84 + 0 + 0 + 0 | **4.17** |
| ethereum `0x4dfa…127c` | 0 | $212 | 796 | $40,008 | 2166 | — | 0 + 0 + 1.74 + 1.84 + 0 + 0 + 0 | **3.58** |
| robinhood `0x9b09…4eb9` | 0 | $716 | 368 | $18,294 | 40 | — | 0 + 0 + 1.54 + 1.7 + 0 + 0 + 0 | **3.25** |
| robinhood `0xcdca…08f0` | 0 | $206 | 505 | $6,559 | 30 | — | 0 + 0 + 1.62 + 1.53 + 0 + 0 + 0 | **3.15** |

**Winner: ethereum `0x6982508145454ce325ddbe47a25d4ec3d2311933`** — 69 labelled wallets (38 smart traders, 26 top PnL, 1 whales, 4 public figures). The runner-up on bnb is a real bridged PEPE (21 labelled wallets) and ranks second, which is the correct answer for someone on BNB Chain; a chain filter (`--chain bnb`) makes it the winner there.

**Impostor flag fired on:** robinhood `0x9b09…` (368 holders, 40d old, 0 labelled).

## What the data taught us (2026-09-16 probe)
- **Structural tags are not evidence.** A dead $36K token deployed in 2023 (`SHIB2`) has a `UniswapV2` holder and a `SHIB2 Token Deployer` holder, and was being crowned "real" on those two tags alone. Pools, deployers, the token contract, ENS/SNS names and burn addresses are now excluded from `recognised_holders`, and a candidate with 0 labelled wallets needs ≥ 3 wealth-tagged holders to be crowned. `SHIB2`, `DOGEAI`, `SHIBAI`, `PEPEAI` now abstain (fixture 11).
- **The holders tiebreak is a legitimacy proxy, not entity labels.** Non-premium `address_label` on `tgm/holders` is almost entirely wealth/activity tags — "Token Millionaire" (115 of ~200 rows we saw), "<TOKEN> Whale", "Liquidity Pool", "High Balance", ENS/SNS names. Exchange / fund / Smart Money entity labels are the 150-credit premium tier and are deliberately not used. What the field still tells you: real tokens have 18–20 of their top 20 holders tagged; the TRUMP impostor had 4. Hence the name `recognised_holders`, the low weight (max ≈ 2.4 of a ~23 winning score), and the reason line that prints the actual tags.
- `exchange_wallet_count` and `fresh_wallets_wallet_count` are always 0 — Nansen's response `warnings` say so. The USD net flows are the real fields.
- `tgm/token-information` requires `timeframe` even though the schema marks it optional (422 "Missing field" without it).
- `tgm/position-intelligence` is perp positioning only; it is not used.
- `hyperliquid` appears as a chain in search results (perp markets); flow-intelligence rejects it, so those candidates are shown as "perp market, not a token contract" and never ranked.
