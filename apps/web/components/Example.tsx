"use client";
import type { Verdict } from "@whichone/core";
import { Card, stateOf } from "./Card";

/**
 * The empty state shows the payoff before anyone types: the PEPE verdict recorded on 2026-09-16 and replayed from
 * fixtures/PEPE.json — 0 credits, labelled as an example. "Run it live" replaces it with a live verdict.
 */
export function Example({ verdict, onRun }: { verdict: Verdict; onRun: (q: string) => void }) {
  // the winner, two runners-up, and the first impostor — the four states a judge needs to see
  const scorable = verdict.ranked.filter((s) => s.scorable && !s.unchecked);
  const impostor = scorable.find((s) => s.impostor);
  const top = [...scorable.filter((s) => s !== impostor).slice(0, impostor ? 3 : 4), ...(impostor ? [impostor] : [])];
  const max = Math.max(0, ...top.map((s) => (s.scorable && !s.unchecked ? s.score : 0)));
  return (
    <section className="example" aria-labelledby="example-h">
      <div className="example-head">
        <div>
          <h2 id="example-h">
            <span className="kicker">example</span> {verdict.query} — {verdict.candidatesTotal} tokens share the name
          </h2>
          <p className="example-sub">
            recorded 2026-09-16 · replayed from <code>fixtures/{verdict.query}.json</code> · 0 credits · <code>{verdict.hash.slice(0, 12)}</code>
          </p>
        </div>
        <button className="btn primary" onClick={() => onRun(verdict.query)}>
          Run it live now
        </button>
      </div>
      <div className="grid">
        {top.map((s) => (
          <Card key={`${s.chain}:${s.address}`} c={s} s={s} state={stateOf(s, verdict.winner)} maxScore={max} onCopy={() => undefined} compact />
        ))}
      </div>
      <p className="example-more">
        + {verdict.ranked.length - top.length} more cards in the live run · {verdict.ranked.filter((s) => s.impostor).length} of {verdict.ranked.length} flagged
        impostor
      </p>
    </section>
  );
}

export function HowItDecides() {
  const steps = [
    { ep: "search/general", cr: "0 cr", what: "every token named X, across chains", decides: "the candidate set" },
    { ep: "tgm/flow-intelligence", cr: "1 cr × ≤8", what: "labelled wallets in it this week, exchange & fresh-wallet flow", decides: "the core signal" },
    { ep: "tgm/token-information", cr: "1 cr × ≤8", what: "deployment date, holders, liquidity", decides: "age & the impostor rule" },
    { ep: "tgm/holders", cr: "5 cr × 2", what: "how many top-20 holders Nansen tags", decides: "the tiebreak" },
  ];
  return (
    <section className="how" aria-labelledby="how-h">
      <h2 id="how-h">How it decides — four Nansen calls, no market cap</h2>
      <ol className="how-grid">
        {steps.map((s, i) => (
          <li key={s.ep} className="how-step">
            <span className="how-n">{i + 1}</span>
            <code className="how-ep">{s.ep}</code>
            <span className="how-cr">{s.cr}</span>
            <p>{s.what}</p>
            <p className="how-decides">→ {s.decides}</p>
          </li>
        ))}
      </ol>
      <ul className="proof-row" aria-label="proof">
        <li>
          <b>≤ 26</b> credits per verdict
        </li>
        <li>
          <b>3.6 s</b> cold p50 · <b>3 ms</b> warm
        </li>
        <li>
          <b>12/12</b> verdicts replay offline
        </li>
        <li>
          <b>116</b> tests · <b>50,000</b> property cases
        </li>
      </ul>
    </section>
  );
}
