# For judges — Which One's Real

> Live copy of this page: **https://whichone.edycu.dev/judge** — no login, no key, no setup.

**Type a ticker. Fourteen tokens share the name — Nansen labels decide which one is real.**

One input → one green card. The score is deterministic arithmetic over Nansen fields only — no market cap, no volume, no search rank — and every verdict ships with the full list of Nansen calls that produced it.

## The 30-second path

1. Open **https://whichone.edycu.dev/?q=PEPE**. Eight cards appear pending, reorder as each `tgm/flow-intelligence` call lands; **ethereum 0x6982…1933** turns green, **robinhood 0x9b09…4eb9** gets a red IMPOSTOR badge. Cold ≈ 4 s, cached ≈ 0 s.
2. Click **Every Nansen call (16)** — the provenance drawer: endpoint, credits, latency, cached or live, the response fields that entered the score, and the verdict hash.
3. Open **https://whichone.edycu.dev/q/SHIB2**. The tool abstains: a 3-year-old token with a Uniswap pool and a deployer tag does not get crowned on those alone.
4. Open **https://whichone.edycu.dev/api/verdict?q=PEPE** — the same verdict as JSON, same hash as the CLI prints.

## Receipts

| | |
|---|---|
| **Hero query, live** | `PEPE`: 14 same-name tokens · **24 credits · 16 calls · 4.4 s cold** · 2026-09-16 23:40 UTC · verdict `6ac53e5e811e` — output verbatim in [DEMO.md](DEMO.md) |
| **Benchmark, live** | 12 queries × 2 cold runs: **cold p50 3.6 s · p95 7.2 s · warm p50 3 ms · mean 18.6 credits, max 26** per verdict; 447 credits over 306 live calls — [docs/BENCH.md](docs/BENCH.md) is the script's output |
| **Nansen endpoints** | `search/general` · `tgm/flow-intelligence` · `tgm/token-information` · `tgm/holders` — every term in the score is one of their response fields |
| **Tests** | **129 tests** (vitest), each regression test named for the defect it pins · **50,000 generated cases** on the decision function (fast-check: crown rule, ranking total order, score reads no buyable field) · **10,000 generated malformed queries** rejected before any network call · the server key never reaches a client (unit + E2E) |
| **Determinism** | 12 recorded verdicts replay offline with the same decision hash, zero network, zero credits |
| **Clean clone → first verdict** | 22 s of machine time (clone 2 s · install 4 s · verdict 4 s · verify < 1 s · build 8 s · tests 4 s) |
| **E2E** | 4 Playwright suites, desktop + Pixel 7, run without a key |

## Reproduce

The real path — live Nansen calls, ≤ 26 credits:

```bash
git clone https://github.com/edycutjong/whichone && cd whichone && npm install
export NANSEN_API_KEY=nsn_...        # your key from https://app.nansen.ai/api
npm run whichone -- PEPE --explain   # every term of the score, every call, the hash
```

**CI / deterministic replay** (not the product — a check that the arithmetic has not drifted):

```bash
npm run verify                       # 12/12 recorded verdicts reproduced offline, no key, no network
```

## Honest limitations

- `search/general` decides the candidate set. An impostor Nansen has not indexed cannot be warned about; a real token on a thinly-labelled chain can lose to a bridged copy on a busy one (the chain filter exists for that).
- A token with 0 labelled wallets can still be crowned when ≥ 3 of its top-20 holders carry a wealth tag (`AI16Z`, `PEPE UNCHAINED` on 2026-09-16). The card says "0 labelled wallets" so the weakness is visible, not hidden.
- `USDC` is the slow outlier (15 s cold): Nansen times out on some of its 24 canonical issues. The drawer shows each timeout; the verdict still lands.

## Links

- Live: https://whichone.edycu.dev
- Repo: https://github.com/edycutjong/whichone — [README](README.md), [DEMO.md](DEMO.md), [docs/SCORING.md](docs/SCORING.md), [docs/BENCH.md](docs/BENCH.md), [docs/DX-REPORT.md](docs/DX-REPORT.md)
- Built by [@edycutjong](https://x.com/edycutjong) for the [Nansen Meridian Buildathon](https://nansen.ai/campaigns/meridian-buildathon)
