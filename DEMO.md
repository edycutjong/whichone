# DEMO — reproduce the recording

The recording is 45 s, muted, two tickers, on the live site. Every beat below is reproducible from a clean clone.

## 0 · Setup (once)

```bash
git clone https://github.com/edycutjong/whichone && cd whichone && npm install
export NANSEN_API_KEY=nsn_...      # your key from https://app.nansen.ai/api
```

## 1 · The hero query — `PEPE` (0:00–0:25 in the recording)

```bash
npm run whichone -- PEPE --explain
```

Live output, 2026-09-16 23:40 UTC (24 credits, 16 calls, 4.4 s cold):

```
PEPE — 14 same-name tokens on Nansen

✔ ethereum   0x6982…1933    PEPE     24.13  91 labelled wallets (52 smart traders, 34 top PnL, 1 whales, 4 public figures) · exchange flow $2.1M · 402K holders ← REAL
    terms: labelled=13.57  exchange=1.99  holders=3.36  liquidity=2.86  age=0  fresh=0  recognisedHolders=2.36
· solana     B5WTLa…2R6B    PEPE     14.11  17 labelled wallets (6 smart traders, 2 top PnL, 1 whales, 8 public figures) · exchange flow $43K · 9K holders
· bnb        0x25d8…bb00    PEPE     13.64  19 labelled wallets (4 smart traders, 10 top PnL, 0 whales, 5 public figures) · exchange flow $595K · 95K holders
· base       0x52b4…777d    PEPE     4.98   0 labelled wallets in 7 days · exchange flow $6K · 11K holders
· base       0x698d…c233    PEPE     4.08   0 labelled wallets in 7 days · no meaningful exchange flow · 5K holders
· ethereum   0x4dfa…127c    PEPE     3.58   0 labelled wallets in 7 days · no meaningful exchange flow · 794 holders
✖ robinhood  0x9b09…4eb9    PEPE     3.25   0 labelled wallets in 7 days · no meaningful exchange flow · 365 holders IMPOSTOR
· arc        0x8871…9d95    PEPE       —    arc: perp market, not a token contract — not ranked
⚠ 14 same-name tokens found; the 8 highest-ranked by Nansen search were checked

ethereum 0x6982508145454ce325ddbe47a25d4ec3d2311933
24 credits · 16 calls (0 cached) · 4.4s · verdict 6ac53e5e811e
```

The point the recording makes: the impostor can have the higher 24h volume and still lose, because nobody labelled has ever touched it.

On the web (`npm run dev` → http://localhost:3000, type `PEPE`): 8 cards appear pending, the progress strip fills as each `tgm/flow-intelligence` call returns, cards reorder with a 300 ms FLIP as scores land, the ethereum card turns green with a Copy button, the robinhood card gets a red IMPOSTOR badge. Click **Every Nansen call (16)** for the drawer.

## 2 · The abstain — `SHIB2` (0:25–0:40)

```bash
npm run whichone -- SHIB2
```

```
SHIB2 — 1 same-name token on Nansen

· ethereum   0x2de7…64c0    SHIB2    3.27   0 labelled wallets in 7 days · no meaningful exchange flow · 568 holders

no winner — none of these looks real — nothing labelled has touched any of them
7 credits · 4 calls (0 cached) · 2.3s · verdict 525078af17c0
```

A 3-year-old token with a Uniswap pool and a deployer tag does not get crowned on those alone (see `docs/SCORING.md`, "structural tags").

## 3 · Prove the verdicts are deterministic (0:40–0:45 — the terminal beat)

```bash
npm run verify      # no key needed
```

```
✔ BABYPEPE             d6b0b7e1f8c1  13 calls replayed · ethereum ✔ · recorded 2026-09-16T13:51Z · 8 · closest top-2 found live …
✔ PEPE                 6ac53e5e811e  16 calls replayed · ethereum ✔ · recorded 2026-09-16T13:51Z · 1 · many same-name candidates — the hero …
…
12/12 verdicts reproduced offline
```

## 4 · Benchmark (optional, ~450 credits)

```bash
npm run bench -- --runs 2 > docs/BENCH.md
```

Latest run: cold p50 3.6 s / p95 7.2 s, warm p50 3 ms, mean 18.6 credits per verdict — see [docs/BENCH.md](docs/BENCH.md).

## What can go wrong on camera, and what you will see instead of a crash

| Failure | What the tool shows |
|---|---|
| Nansen hangs on one candidate's `token-information` (seen on USDC/solana) | that card says "age unknown", the drawer lists the timeout in red, the verdict still lands |
| `flow-intelligence` fails for a candidate | the card is "could not check" — never crowned, never an impostor; the banner says how many were checked |
| all lookups fail | "Nansen lookups failed for every candidate — retry" |
| zero search results | "no token named X on Nansen" |
| a typo like `<script>` | HTTP 400 from `/api/verdict`, nothing rendered |
