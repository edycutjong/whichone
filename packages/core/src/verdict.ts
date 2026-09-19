import type { NansenClient, Call } from "./client.js";
import { sha256 } from "./client.js";
import { searchCandidates, sameName, scorable, type Candidate } from "./search.js";
import { fetchFacts, fetchHolderFacts, STABLECOINS } from "./facts.js";
import { score, unscorable, rank, ABSTAIN_THRESHOLD, MIN_RECOGNISED_TO_CROWN, WEIGHTS, type Scored } from "./score.js";

export type Verdict = {
  query: string;
  chainFilter?: string;
  /** the one green card, or null when the tool abstains */
  winner: Scored | null;
  ranked: Scored[];
  abstained: boolean;
  abstainReason?: string;
  /** stablecoins: many same-name results are canonical per chain — header copy changes, no impostor flags */
  stablecoin: boolean;
  candidatesTotal: number;
  /** honest caveats the UI must show, e.g. "2 candidates could not be checked" */
  warnings: string[];
  provenance: Call[];
  credits: number;
  ms: number;
  cachedAt?: string;
  weights: typeof WEIGHTS;
  /** sha256 of the decision (query, ranking, winner, weights) — never cost or timing — printed on the share card */
  hash: string;
};

/** Progress events for a streaming view: the candidate list, then each candidate as its facts land, then the verdict. */
export type VerdictEvent =
  | { type: "candidates"; query: string; candidates: Candidate[]; total: number }
  | { type: "scored"; candidate: Scored; done: number; of: number }
  | { type: "verdict"; verdict: Verdict };

export type VerdictOptions = {
  chain?: string;
  onProgress?: (e: VerdictEvent) => void;
  /** max candidates scored (after the same-name filter). Default 8. */
  cap?: number;
  /** finalists that get the holders tiebreak call. Default 2. */
  finalists?: number;
  now?: number;
};

/** The whole product: ticker in → one green winner (or an honest abstain). ≤ 26 credits at cap 8. */
export async function whichOnesReal(client: NansenClient, query: string, opts: VerdictOptions = {}): Promise<Verdict> {
  const started = Date.now();
  const callsBefore = client.calls.length;
  const cap = opts.cap ?? 8;
  const q = query.trim();
  const stablecoin = STABLECOINS.has(q.toUpperCase());

  const all = await searchCandidates(client, q, { chain: opts.chain });
  const same = all.filter((c) => sameName(q, c));
  const chosen = same.slice(0, cap);
  const emit = opts.onProgress ?? (() => {});
  emit({ type: "candidates", query: q, candidates: chosen, total: same.length });

  let done = 0;
  const facts = await Promise.all(
    chosen.map(async (c) => {
      const f = scorable(c) ? await fetchFacts(client, c, opts.now) : { ...c, ...emptyFacts(), errors: [] };
      // provisional score (before the holders tiebreak) so a live view can reorder as facts arrive
      emit({
        type: "scored",
        candidate: scorable(c) ? score(f) : unscorable(f, `${f.chain}: perp market, not a token contract — not ranked`),
        done: ++done,
        of: chosen.length,
      });
      return f;
    }),
  );
  let scored: Scored[] = facts.map((f, i) => (scorable(chosen[i]) ? score(f) : unscorable(f, `${f.chain}: perp market, not a token contract — not ranked`)));

  // Tiebreak: labelled holders for the finalists, then re-score.
  const finalists = rank(scored)
    .filter((s) => s.scorable && !s.unchecked)
    .slice(0, opts.finalists ?? 2);
  const withHolders = await Promise.all(finalists.map((fin) => fetchHolderFacts(client, fin)));
  for (const wh of withHolders) scored = scored.map((s) => (s.chain === wh.chain && s.address === wh.address ? score(wh) : s));
  if (stablecoin) scored = scored.map((s) => ({ ...s, impostor: false, reasons: s.reasons.filter((r) => !r.startsWith("IMPOSTOR")) }));
  const ranked = rank(scored);

  const unchecked = ranked.filter((s) => s.unchecked);
  const warnings: string[] = [];
  const checkedCount = ranked.filter((s) => s.scorable && !s.unchecked).length;
  if (unchecked.length)
    warnings.push(
      `${unchecked.length} candidate${unchecked.length === 1 ? "" : "s"} could not be checked (Nansen lookup failed) — the verdict is among the ${checkedCount} that were`,
    );
  if (same.length > cap) warnings.push(`${same.length} same-name tokens found; the ${cap} highest-ranked by Nansen search were checked`);

  const { winner, abstainReason } = crown(ranked, same.length, q);

  const provenance = client.calls.slice(callsBefore);
  const credits = provenance.reduce((n, c) => n + c.credits, 0);
  // The hash covers the DECISION only — query, filter, the ordered candidate list, who won, who was flagged, and the
  // weights. Never cost, timing, market cap, volume, search rank or error text, so two live runs that reach the same
  // decision hash identically and a cached replay matches the live run it came from.
  const decision = {
    query: q,
    chainFilter: opts.chain ?? null,
    weights: WEIGHTS,
    stablecoin,
    abstained: winner === null,
    abstainReason: abstainReason ?? null,
    winner: winner ? `${winner.chain}:${winner.address}` : null,
    ranked: ranked.map((s) => ({
      id: `${s.chain}:${s.address}`,
      score: s.scorable && !s.unchecked ? s.score : null,
      impostor: s.impostor,
      unchecked: s.unchecked,
    })),
  };
  const verdict: Verdict = {
    query: q,
    chainFilter: opts.chain,
    winner,
    ranked,
    abstained: winner === null,
    abstainReason,
    stablecoin,
    candidatesTotal: same.length,
    warnings,
    credits,
    provenance,
    ms: Date.now() - started,
    weights: WEIGHTS,
    hash: sha256(JSON.stringify(decision)),
  };
  emit({ type: "verdict", verdict });
  return verdict;
}

/**
 * The crown rule — the one decision that must never be wrong, kept pure so it can be verified over generated inputs
 * (test/property.test.ts): the winner is always `ranked[0]`, is scorable and checked, scores ≥ ABSTAIN_THRESHOLD, and a
 * candidate with 0 labelled wallets needs ≥ MIN_RECOGNISED_TO_CROWN wealth-tagged top holders, and is never impostor-flagged.
 * Everything else abstains.
 */
export function crown(ranked: Scored[], sameNameCount: number, q: string): { winner: Scored | null; abstainReason?: string } {
  const best = ranked[0];
  if (sameNameCount === 0)
    return {
      winner: null,
      abstainReason: looksLikeAddress(q)
        ? `${q.slice(0, 6)}…${q.slice(-4)} is a contract address — type the ticker or name instead; this tool finds the address for you`
        : `no token named ${q} on Nansen`,
    };
  if (!best || !best.scorable) return { winner: null, abstainReason: "no candidate on a chain Nansen can score" };
  if (best.unchecked) return { winner: null, abstainReason: "Nansen lookups failed for every candidate — retry" };
  if (best.labelledWallets === 0 && best.recognisedHolders == null && best.errors.some((e) => e.startsWith("holders failed")))
    return { winner: null, abstainReason: "the deciding holders lookup failed for the top candidate — retry" };
  if (best.score < ABSTAIN_THRESHOLD || (best.labelledWallets === 0 && (best.recognisedHolders ?? 0) < MIN_RECOGNISED_TO_CROWN))
    return { winner: null, abstainReason: "none of these looks real — nothing labelled has touched any of them" };
  // a card cannot be "this is the one" and IMPOSTOR at once: when the best candidate trips the impostor rule, abstain
  if (best.impostor) return { winner: null, abstainReason: "none of these looks real — the best candidate trips the impostor rule" };
  return { winner: best };
}

/** EVM (0x + 40 hex) or base58 (Solana-style, 32–44 chars) — the input the tool exists to *produce*, not consume. */
export function looksLikeAddress(q: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(q) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);
}

function emptyFacts() {
  return {
    labelledWallets: 0,
    smartTraderWallets: 0,
    whaleWallets: 0,
    topPnlWallets: 0,
    publicFigureWallets: 0,
    smartTraderNetFlowUsd: 0,
    exchangeNetFlowUsd: 0,
    freshNetFlowUsd: 0,
    exchangeTouched: false,
    freshShare: NaN,
  };
}
