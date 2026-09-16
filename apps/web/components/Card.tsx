"use client";
import type { Scored, Candidate } from "@whichone/core";

export type CardState = "pending" | "winner" | "greyed" | "impostor" | "unscorable" | "unchecked";

export function short(a: string) { return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a; }
function usd(n: number) { const m = Math.abs(n); return m >= 1e6 ? `$${(m / 1e6).toFixed(1)}M` : m >= 1e3 ? `$${Math.round(m / 1e3)}K` : `$${Math.round(m)}`; }
function int(n: number) { return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(Math.round(n)); }
function age(d?: number) { return d == null ? "age unknown" : d >= 365 ? `${(d / 365).toFixed(1)}y old` : `${Math.round(d)}d old`; }

export function stateOf(s: Scored, winner: Scored | null | undefined): CardState {
  if (!s.scorable) return "unscorable";
  if (s.unchecked) return "unchecked";
  if (winner && winner.chain === s.chain && winner.address === s.address) return "winner";
  if (s.impostor) return "impostor";
  return "greyed";
}

export function Card({ c, s, state, maxScore, onCopy, explain }: { c: Candidate; s?: Scored; state: CardState; maxScore: number; onCopy: (s: Candidate) => void; explain?: boolean }) {
  const pct = s && s.scorable && !s.unchecked && maxScore > 0 ? Math.max(4, Math.round((Math.max(0, s.score) / maxScore) * 100)) : 0;
  return (
    <article className={`card ${state}`} data-id={`${c.chain}:${c.address}`} aria-label={`${c.name} on ${c.chain}`}>
      <div className="top">
        {s?.logo ? <img className="logo" src={s.logo} alt="" /> : <span className="logo" aria-hidden />}
        <span className="name">{c.name} <span className="sym">{c.symbol}</span></span>
        <span className="badge chain">{c.chain}</span>
        {state === "winner" && <span className="badge real">this is the one</span>}
        {state === "impostor" && <span className="badge impostor">impostor</span>}
        {state === "pending" && <span className="badge muted">checking Nansen…</span>}
        {state === "unchecked" && <span className="badge warn">could not check</span>}
        {state === "unscorable" && <span className="badge muted">perp market</span>}
      </div>
      <div className="addr">{state === "winner" ? <b>{c.address}</b> : short(c.address)}</div>
      {s && s.scorable && !s.unchecked && (
        <div className="facts">
          <span className="fact">{s.labelledWallets} labelled wallets</span>
          <span className="fact">{Math.abs(s.exchangeNetFlowUsd) >= 1000 ? `exchange flow ${usd(s.exchangeNetFlowUsd)}` : "no exchange flow"}</span>
          <span className="fact">{age(s.ageDays)}</span>
          {s.totalHolders != null && <span className="fact">{int(s.totalHolders)} holders</span>}
          {s.recognisedHolders != null && <span className="fact">{s.recognisedHolders}/20 top holders tagged</span>}
        </div>
      )}
      {s && <p className="reason">{s.reasons.filter((r) => !r.startsWith("IMPOSTOR")).slice(0, 3).join(" · ")}</p>}
      {s && s.scorable && !s.unchecked && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
      {explain && s && s.scorable && !s.unchecked && <div className="explain">score {s.score.toFixed(2)} = {Object.entries(s.terms).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`).join("  ")}</div>}
      {state === "winner" && (
        <div className="actions">
          <button className="btn primary" onClick={() => onCopy(c)}>Copy address</button>
        </div>
      )}
    </article>
  );
}
