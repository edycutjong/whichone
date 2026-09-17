import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/Shell";

/**
 * /judge — a page built for exactly one reader. No auth, no cookies, no API call, no key: it is prerendered at build time
 * and mirrored verbatim in JUDGE.md at the repo root. Every number below is a real-run receipt with its source next to it.
 */
export const metadata: Metadata = {
  title: "Which One's Real — for judges",
  description: "The claim, the 30-second path, the receipts, the real reproduce command, and the honest limitations.",
};

const SITE = "https://whichone.edycu.dev";
const REPO = "https://github.com/edycutjong/whichone";

const TEST_COUNT = 129;
const PROPERTY_CASES = "50,000";
const BOUNDARY_CASES = "10,000";
const E2E_SUITES = 4;

export default function Judge() {
  return (
    <>
      <SiteHeader current="judge" />
      <main className="wrap judge">
        <p className="judge-kicker">
          <Link href="/">← the tool</Link> · for judges · no login, no key, no setup
        </p>
        <h1>Type a ticker. Fourteen tokens share the name — Nansen labels decide which one is real.</h1>
        <p className="judge-lede">
          One input → one green card. The score is deterministic arithmetic over Nansen fields only — no market cap, no volume, no search rank — and every
          verdict ships with the full list of Nansen calls that produced it.
        </p>

        <h2>The 30-second path</h2>
        <ol>
          <li>
            Open{" "}
            <a href={`${SITE}/?q=PEPE`}>
              <code>{SITE}/?q=PEPE</code>
            </a>
            . Eight cards appear pending, reorder as each <code>tgm/flow-intelligence</code> call lands; <b>ethereum 0x6982…1933</b> turns green,{" "}
            <b>robinhood 0x9b09…4eb9</b> gets a red IMPOSTOR badge. Cold ≈ 4 s, cached ≈ 0 s.
          </li>
          <li>
            Click <b>Every Nansen call (16)</b> — the provenance drawer: endpoint, credits, latency, cached or live, the response fields that entered the score,
            and the verdict hash.
          </li>
          <li>
            Open{" "}
            <a href={`${SITE}/q/SHIB2`}>
              <code>{SITE}/q/SHIB2</code>
            </a>
            . The tool abstains: a 3-year-old token with a Uniswap pool and a deployer tag does not get crowned on those alone.
          </li>
          <li>
            Open{" "}
            <a href={`${SITE}/api/verdict?q=PEPE`}>
              <code>{SITE}/api/verdict?q=PEPE</code>
            </a>{" "}
            — the same verdict as JSON, same hash as the CLI prints.
          </li>
        </ol>

        <h2>Receipts</h2>
        <table className="judge-table">
          <tbody>
            <tr>
              <th>Hero query, live</th>
              <td>
                <code>PEPE</code>: 14 same-name tokens · <b>24 credits · 16 calls · 4.4 s cold</b> · 2026-09-16 23:40 UTC · verdict <code>6ac53e5e811e</code> —
                output verbatim in <a href={`${REPO}/blob/main/DEMO.md`}>DEMO.md</a>
              </td>
            </tr>
            <tr>
              <th>Benchmark, live</th>
              <td>
                12 queries × 2 cold runs: <b>cold p50 3.6 s · p95 7.2 s · warm p50 3 ms · mean 18.6 credits, max 26</b> per verdict; 447 credits over 306 live
                calls — <a href={`${REPO}/blob/main/docs/BENCH.md`}>docs/BENCH.md</a> is the script&rsquo;s output
              </td>
            </tr>
            <tr>
              <th>Nansen endpoints</th>
              <td>
                <code>search/general</code> · <code>tgm/flow-intelligence</code> · <code>tgm/token-information</code> · <code>tgm/holders</code> — every term in
                the score is one of their response fields
              </td>
            </tr>
            <tr>
              <th>Tests</th>
              <td>
                <b>{TEST_COUNT} tests</b> (vitest), each regression test named for the defect it pins · <b>{PROPERTY_CASES} generated cases</b> on the decision
                function (fast-check: crown rule, ranking total order, score reads no buyable field) · <b>{BOUNDARY_CASES} generated malformed queries</b>{" "}
                rejected before any network call · the server key never reaches a client (unit + E2E)
              </td>
            </tr>
            <tr>
              <th>Determinism</th>
              <td>12 recorded verdicts replay offline with the same decision hash, zero network, zero credits</td>
            </tr>
            <tr>
              <th>Clean clone → first verdict</th>
              <td>22 s of machine time (clone 2 s · install 4 s · verdict 4 s · verify &lt; 1 s · build 8 s · tests 4 s)</td>
            </tr>
            <tr>
              <th>E2E</th>
              <td>{E2E_SUITES} Playwright suites, desktop + Pixel 7, run without a key</td>
            </tr>
          </tbody>
        </table>

        <h2>Reproduce</h2>
        <p>The real path — live Nansen calls, ≤ 26 credits:</p>
        <pre>
          <code>{`git clone ${REPO} && cd whichone && npm install
export NANSEN_API_KEY=nsn_...        # your key from https://app.nansen.ai/api
npm run whichone -- PEPE --explain   # every term of the score, every call, the hash`}</code>
        </pre>
        <p>
          <b>CI / deterministic replay</b> (not the product — a check that the arithmetic has not drifted):
        </p>
        <pre>
          <code>{`npm run verify                       # 12/12 recorded verdicts reproduced offline, no key, no network`}</code>
        </pre>

        <h2>Honest limitations</h2>
        <ul>
          <li>
            <code>search/general</code> decides the candidate set. An impostor Nansen has not indexed cannot be warned about; a real token on a thinly-labelled
            chain can lose to a bridged copy on a busy one (the chain filter exists for that).
          </li>
          <li>
            A token with 0 labelled wallets can still be crowned when ≥ 3 of its top-20 holders carry a wealth tag (<code>AI16Z</code>,{" "}
            <code>PEPE UNCHAINED</code> on 2026-09-16). The card says &ldquo;0 labelled wallets&rdquo; so the weakness is visible, not hidden.
          </li>
          <li>
            <code>USDC</code> is the slow outlier (15 s cold): Nansen times out on some of its 24 canonical issues. The drawer shows each timeout; the verdict
            still lands.
          </li>
        </ul>

        <h2>Links</h2>
        <ul>
          <li>
            Live: <a href={SITE}>{SITE}</a>
          </li>
          <li>
            Repo: <a href={REPO}>{REPO}</a> — README, <a href={`${REPO}/blob/main/JUDGE.md`}>JUDGE.md</a> (this page),{" "}
            <a href={`${REPO}/blob/main/DEMO.md`}>DEMO.md</a>, <a href={`${REPO}/blob/main/docs/SCORING.md`}>SCORING.md</a>,{" "}
            <a href={`${REPO}/blob/main/docs/BENCH.md`}>BENCH.md</a>, <a href={`${REPO}/blob/main/docs/DX-REPORT.md`}>DX-REPORT.md</a>
          </li>
          <li>
            Built by <a href="https://x.com/edycutjong">@edycutjong</a> for the{" "}
            <a href="https://nansen.ai/campaigns/meridian-buildathon">Nansen Meridian Buildathon</a>
          </li>
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
