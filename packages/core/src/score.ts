import type { CandidateFacts } from "./facts.js";

/**
 * The ranking function. Every term is a Nansen field; nothing here reads market cap, volume or
 * search rank, because those are exactly what an impostor can buy. See docs/SCORING.md for the
 * arithmetic worked on the PEPE example with real numbers.
 */
export const WEIGHTS = {
  /** log1p(labelled wallets active in 7d) — the core signal */
  labelled: 3.0,
  /** 0.6 · max(0, log10|exchange_net_flow_usd| − 3): nothing below $1K, $10K → 0.6, $1M → 1.8 */
  exchange: 0.6,
  /** log10(1 + total holders) — breadth; hard to fake at scale */
  holders: 0.6,
  /** log10(1 + liquidity USD) — depth; can be bought, so weighted low */
  liquidity: 0.4,
  /** deployed < 7 days ago */
  young7: 2.0,
  /** deployed < 30 days ago */
  young30: 1.0,
  /** fresh-wallet share of flow, applied only when fewer than 3 labelled wallets are present */
  freshPenalty: 1.5,
  /** top-20 holders Nansen recognises with any (non-premium) tag — a legitimacy proxy, not entity labels; finalists only */
  recognisedHolders: 0.8,
} as const;

/** Below this the best candidate is not crowned; the tool abstains instead of guessing. */
export const ABSTAIN_THRESHOLD = 2.0;

export type Scored = CandidateFacts & {
  score: number;
  /** flow-intelligence failed for this candidate: it is shown, never crowned, never called an impostor */
  unchecked: boolean;
  /** each term's contribution, for the provenance drawer and `--explain` */
  terms: Record<string, number>;
  reasons: string[];
  impostor: boolean;
  scorable: boolean;
};

const log1p = Math.log1p;
const log10p = (x: number) => Math.log10(1 + Math.max(0, x));

export function score(f: CandidateFacts, w = WEIGHTS): Scored {
  const terms: Record<string, number> = {};
  const reasons: string[] = [];

  // No flow facts → no verdict on this candidate. Zeroed defaults are not evidence of anything.
  if (f.errors.some((e) => e.startsWith("flow-intelligence failed"))) {
    return { ...f, score: Number.NEGATIVE_INFINITY, terms: {}, reasons: ["could not be checked (flow lookup failed) — retry"], impostor: false, scorable: true, unchecked: true };
  }

  terms.labelled = w.labelled * log1p(f.labelledWallets);
  reasons.push(f.labelledWallets > 0
    ? `${f.labelledWallets} labelled wallets (${f.smartTraderWallets} smart traders, ${f.topPnlWallets} top PnL, ${f.whaleWallets} whales, ${f.publicFigureWallets} public figures)`
    : "0 labelled wallets in 7 days");

  const exchMag = Math.abs(f.exchangeNetFlowUsd);
  terms.exchange = exchMag > 0 ? w.exchange * Math.max(0, Math.log10(exchMag) - 3) : 0;
  reasons.push(exchMag >= 1000 ? `exchange flow ${fmtUsd(exchMag)}` : "no meaningful exchange flow");

  terms.holders = f.totalHolders != null ? w.holders * log10p(f.totalHolders) : 0;
  terms.liquidity = f.liquidityUsd != null ? w.liquidity * log10p(f.liquidityUsd) : 0;
  if (f.totalHolders != null) reasons.push(`${fmtInt(f.totalHolders)} holders`);

  if (f.ageDays == null) { terms.age = 0; reasons.push("age unknown"); }
  else if (f.ageDays < 7) { terms.age = -w.young7; reasons.push(`deployed ${Math.max(1, Math.round(f.ageDays))}d ago`); }
  else if (f.ageDays < 30) { terms.age = -w.young30; reasons.push(`deployed ${Math.round(f.ageDays)}d ago`); }
  else { terms.age = 0; reasons.push(fmtAge(f.ageDays)); }

  const freshApplies = f.labelledWallets < 3 && !Number.isNaN(f.freshShare);
  terms.fresh = freshApplies ? -w.freshPenalty * f.freshShare : 0;
  if (freshApplies && f.freshShare > 0.5) reasons.push(`${Math.round(f.freshShare * 100)}% of flow is fresh wallets`);

  terms.recognisedHolders = f.recognisedHolders != null ? w.recognisedHolders * log1p(f.recognisedHolders) : 0;
  if (f.recognisedHolders != null) reasons.push(`${f.recognisedHolders} of top 20 holders tagged by Nansen${f.topLabels?.length ? ` (${f.topLabels.join(", ")})` : ""}`);

  const total = Object.values(terms).reduce((a, b) => a + b, 0);
  const impostor = f.labelledWallets === 0 && exchMag < 10_000 && ((f.ageDays != null && f.ageDays < 14) || (f.totalHolders != null && f.totalHolders < 500));
  if (impostor) reasons.push("IMPOSTOR: nothing labelled has ever touched it");

  const failed = f.errors.filter((e) => e.includes(" failed")).map((e) => e.split(" failed")[0]);
  if (failed.length) reasons.push("partial: " + failed.join(", ") + " lookup failed");
  return { ...f, score: round(total), terms: mapValues(terms, round), reasons, impostor, scorable: true, unchecked: false };
}

/** A candidate on a chain flow-intelligence cannot score (e.g. a hyperliquid perp market). */
export function unscorable(f: CandidateFacts, why: string): Scored {
  return { ...f, score: -Infinity, terms: {}, reasons: [why], impostor: false, scorable: false, unchecked: false };
}

/** Sort: checked+scorable first by score desc, then labelled wallets, then holders; unchecked next; unscorable last. */
export function rank(list: Scored[]): Scored[] {
  const tier = (s: Scored) => (!s.scorable ? 0 : s.unchecked ? 1 : 2);
  return [...list].sort((a, b) =>
    tier(b) - tier(a) ||
    b.score - a.score ||
    b.labelledWallets - a.labelledWallets ||
    (b.totalHolders ?? 0) - (a.totalHolders ?? 0));
}

function round(x: number) { return Math.round(x * 100) / 100; }
function mapValues<T extends Record<string, number>>(o: T, fn: (v: number) => number): T { return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v)])) as T; }
function fmtUsd(n: number) { return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`; }
function fmtInt(n: number) { return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(Math.round(n)); }
function fmtAge(d: number) { return d >= 365 ? `${(d / 365).toFixed(1)}y old` : `${Math.round(d)}d old`; }
