"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Candidate, Scored, Verdict, VerdictEvent, Call, CallEvent } from "@whichone/core";
import { Card, stateOf } from "./Card";
import { Drawer } from "./Drawer";
import { Rail, useRail } from "./Rail";
import { useFlip } from "./useFlip";
import { Example, HowItDecides } from "./Example";

const EXAMPLES = ["PEPE", "WLFI", "TRUMP", "BONK", "USDC", "DEGEN"];
const CHAINS = ["all", "ethereum", "base", "solana", "bnb"];

type Phase = "idle" | "searching" | "checking" | "done" | "error";
type StreamEvent = VerdictEvent | CallEvent | { type: "error"; message: string } | { type: "asOf"; asOf: string | null };

export function Whichone({
  initialQuery,
  initialChain,
  initialVerdict,
  example,
}: {
  initialQuery?: string;
  initialChain?: string;
  initialVerdict?: Verdict | null;
  example?: Verdict;
}) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [chain, setChain] = useState(initialChain ?? "all");
  // a query arriving without a verdict (/?q=PEPE, or /q/PEPE when the server-side verdict failed) starts in "searching":
  // the stream below is kicked off on mount and every state change it makes happens in a callback, never synchronously
  const [phase, setPhase] = useState<Phase>(initialVerdict ? "done" : initialQuery ? "searching" : "idle");
  const [candidates, setCandidates] = useState<Candidate[]>(initialVerdict?.ranked ?? []);
  const [scored, setScored] = useState<Map<string, Scored>>(new Map(initialVerdict?.ranked.map((s) => [`${s.chain}:${s.address}`, s]) ?? []));
  const [verdict, setVerdict] = useState<Verdict | null>(initialVerdict ?? null);
  const [progress, setProgress] = useState({ done: 0, of: 0 });
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [explain, setExplain] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The call rail: seeded with the server-rendered verdict's provenance (permalink) or the recorded example's
  // (idle home, labelled replayed); every live run then streams its own call:start / call:end rows into it.
  const rail = useRail(
    initialVerdict
      ? { query: initialVerdict.query, calls: initialVerdict.provenance, replayed: false, ms: initialVerdict.ms }
      : example && !initialQuery
        ? { query: example.query, calls: example.provenance, replayed: true }
        : undefined,
  );
  const { begin: railBegin, onEvent: railEvent, finish: railFinish } = rail; // stable callbacks — safe hook deps
  const batchRef = useRef(0);

  const id = (c: Candidate) => `${c.chain}:${c.address}`;
  // address → symbol for the rail's one-line param summaries (candidates land before any per-token call starts)
  const symbolOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const list of [example?.ranked ?? [], initialVerdict?.ranked ?? [], candidates, verdict?.ranked ?? []])
      for (const c of list) m.set(c.address.toLowerCase(), c.symbol || c.name);
    return (address: string) => m.get(address.toLowerCase());
  }, [example, initialVerdict, candidates, verdict]);

  // Ranked view: the verdict's order once it exists; otherwise provisional scores as they land, pending cards last.
  const ordered = useMemo(() => {
    if (verdict) return verdict.ranked.map((s) => ({ c: s as Candidate, s }));
    const tier = (s?: Scored) => (!s ? 1 : !s.scorable ? 0 : s.unchecked ? 1 : 2);
    return [...candidates]
      .map((c) => ({ c, s: scored.get(id(c)) }))
      .sort((a, b) => tier(b.s) - tier(a.s) || (b.s?.score ?? -Infinity) - (a.s?.score ?? -Infinity));
  }, [candidates, scored, verdict]);
  const maxScore = Math.max(0, ...ordered.map((o) => (o.s && o.s.scorable && !o.s.unchecked ? o.s.score : 0)));
  useFlip(gridRef, ordered.map((o) => id(o.c)).join("|"));

  /** Fetch + parse the NDJSON stream for one query. Only touches state from inside the stream (after the first await). */
  const stream = useCallback(
    async (term: string, ch: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      if (typeof history !== "undefined") history.replaceState(null, "", `/?q=${encodeURIComponent(term)}${ch !== "all" ? `&chain=${ch}` : ""}`);
      try {
        const batch = (batchRef.current = railBegin(term));
        const res = await fetch(`/api/verdict?q=${encodeURIComponent(term)}${ch !== "all" ? `&chain=${ch}` : ""}&stream=1`, { signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error ?? res.statusText);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let sawVerdict = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            const e = JSON.parse(line) as StreamEvent;
            if (e.type === "candidates") {
              setCandidates(e.candidates);
              setProgress({ done: 0, of: e.candidates.length });
              setPhase("checking");
            } else if (e.type === "scored") {
              setScored((m) => new Map(m).set(id(e.candidate), e.candidate));
              setProgress({ done: e.done, of: e.of });
            } else if (e.type === "verdict") {
              sawVerdict = true;
              setVerdict(e.verdict);
              railFinish(batch, e.verdict.ms);
              setPhase("done");
            } else if (e.type === "call:start" || e.type === "call:end") railEvent(batch, e);
            else if (e.type === "asOf") setAsOf(e.asOf);
            else if (e.type === "error") throw new Error(e.message);
          }
        }
        if (!sawVerdict) throw new Error("the stream ended before a verdict arrived — try again");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
        setPhase("error");
      }
    },
    [railBegin, railEvent, railFinish],
  );

  /** A user-initiated run: reset every piece of verdict state, then stream. */
  const run = useCallback(
    (query: string, ch: string) => {
      const term = query.trim();
      if (!term) return;
      setPhase("searching");
      setError(null);
      setVerdict(null);
      setCandidates([]);
      setScored(new Map());
      setProgress({ done: 0, of: 0 });
      setAsOf(null);
      setDrawer(false);
      void stream(term, ch);
    },
    [stream],
  );

  // Escape closes the provenance drawer (the recording and keyboard users both expect it)
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [drawer]);

  useEffect(() => {
    // stream() sets state only from inside the response loop and its catch — every call is after `await fetch`; the
    // compiler lint cannot see across that async boundary, so it is silenced for this one line, not the file
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialQuery?.trim() && !initialVerdict) void stream(initialQuery.trim(), initialChain ?? "all");
  }, [initialQuery, initialChain, initialVerdict, stream]);

  const copy = async (c: Candidate) => {
    try {
      await navigator.clipboard.writeText(c.address);
      setToast(`copied · ${c.chain} · ${c.address.slice(0, 6)}…${c.address.slice(-4)}`);
    } catch {
      setToast("copy failed — select the address");
    }
    setTimeout(() => setToast(null), 2300);
  };
  const share = async () => {
    const url = `${location.origin}/q/${encodeURIComponent(verdict!.query)}${verdict!.chainFilter ? `?chain=${verdict!.chainFilter}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("share link copied");
    } catch {
      setToast(url);
    }
    setTimeout(() => setToast(null), 2300);
  };

  const calls: Call[] = verdict?.provenance ?? [];
  const status =
    phase === "searching"
      ? "asking Nansen for every token by that name…"
      : phase === "checking"
        ? `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} · checking labels… ${progress.done}/${progress.of}`
        : phase === "done" && verdict
          ? `${verdict.credits} credits · ${calls.length} calls · ${(verdict.ms / 1000).toFixed(1)} s${asOf ? ` · as of ${asOf.slice(11, 16)} UTC` : ""}`
          : "";

  const running = phase === "searching" || phase === "checking";
  const runExample = example
    ? () => {
        setQ(example.query);
        void run(example.query, chain);
      }
    : undefined;

  return (
    <>
      <main className="wrap">
        <header className="hero">
          <h1>
            Which one&rsquo;s <span className="real">real</span>?
          </h1>
          <p>Type a ticker. Every token with that name, ranked by who holds and trades it. One turns green.</p>
        </header>

        <div className="panel">
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              void run(q, chain);
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="PEPE, WLFI, TRUMP — a ticker, not an address"
              aria-label="ticker"
              autoFocus
              maxLength={44}
              spellCheck={false}
              autoCapitalize="characters"
            />
            <button type="submit" disabled={phase === "searching" || phase === "checking"}>
              Check
            </button>
          </form>
          <div className="chips" role="group" aria-label={phase === "idle" ? "examples" : "chain filter"}>
            {phase === "idle"
              ? EXAMPLES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setQ(e);
                      void run(e, chain);
                    }}
                  >
                    {e}
                  </button>
                ))
              : CHAINS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${chain === c ? "on" : ""}`}
                    onClick={() => {
                      setChain(c);
                      if (verdict || phase === "error") void run(q, c);
                    }}
                  >
                    {c}
                  </button>
                ))}
          </div>
        </div>

        <div className={`progress ${phase === "idle" ? "hidden" : ""}`}>
          <i
            style={{
              width:
                phase === "searching"
                  ? "8%"
                  : phase === "checking"
                    ? `${8 + (progress.of ? (progress.done / progress.of) * 92 : 0)}%`
                    : phase === "done"
                      ? "100%"
                      : "0%",
            }}
          />
        </div>
        <p className={`status ${phase === "idle" ? "hidden" : ""}`} aria-live="polite">
          {status}
        </p>

        {phase === "error" && (
          <div className="banner err">
            Nansen lookup failed<small>{error}</small>
          </div>
        )}
        {verdict && verdict.abstained && (
          <div className="banner warn">
            No winner — {verdict.abstainReason}
            <small>{verdict.candidatesTotal === 0 ? "try the full name, or check the spelling" : "the cards below show why each one fell short"}</small>
          </div>
        )}
        {verdict && !verdict.abstained && verdict.winner && (
          <div className="banner ok">
            {verdict.stablecoin
              ? `${verdict.candidatesTotal} canonical ${verdict.query} issues — the one with the most labelled activity is first`
              : `1 of ${verdict.candidatesTotal} looks real — ${verdict.winner.chain} · ${verdict.winner.address.slice(0, 6)}…${verdict.winner.address.slice(-4)}`}
            {verdict.warnings.length > 0 && <small>{verdict.warnings.join(" · ")}</small>}
          </div>
        )}

        <div className="grid" ref={gridRef}>
          {ordered.map(({ c, s }) => (
            <Card
              key={id(c)}
              c={c}
              s={s}
              state={s ? (verdict ? stateOf(s, verdict.winner) : !s.scorable ? "unscorable" : s.unchecked ? "unchecked" : "greyed") : "pending"}
              maxScore={maxScore}
              onCopy={copy}
              explain={explain}
            />
          ))}
        </div>

        {verdict && (
          <div className="actions" style={{ justifyContent: "center", marginTop: 20 }}>
            <button className="btn" onClick={() => setDrawer(true)}>
              Every Nansen call ({calls.length})
            </button>
            <button className="btn" onClick={() => setExplain((x) => !x)}>
              {explain ? "hide" : "show"} the arithmetic
            </button>
            <button className="btn" onClick={share}>
              Share this verdict
            </button>
          </div>
        )}

        {phase === "idle" && example && runExample && <Example verdict={example} onRun={runExample} />}
        {phase === "idle" && <HowItDecides />}

        <Drawer
          calls={calls}
          open={drawer}
          onClose={() => setDrawer(false)}
          credits={verdict?.credits ?? 0}
          ms={verdict?.ms ?? 0}
          asOf={asOf}
          hash={verdict?.hash}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>
      <Rail
        rows={rail.rows}
        batches={rail.batches}
        running={running}
        symbolOf={symbolOf}
        onClear={() => rail.clear(running ? batchRef.current : undefined)}
        onRunExample={running ? undefined : runExample}
        exampleQuery={example?.query}
      />
    </>
  );
}
