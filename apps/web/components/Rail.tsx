"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, CallEvent } from "@whichone/core";
import { REPO } from "./Shell";

/**
 * The Nansen call rail — the live meter next to the verdict. Every row is a real call from the page's own provenance
 * stream (`call:start` / `call:end` from /api/verdict, or the recorded example's provenance on load, labelled
 * replayed). The drawer prints the same Call objects afterwards, so the two can never disagree.
 */
export type RailStatus = "pending" | "live" | "cached" | "error";
export type RailRow = {
  id: string;
  batch: number;
  endpoint: string;
  body: Record<string, unknown>;
  status: RailStatus;
  call?: Call;
  startedAt: number;
  replayed: boolean;
};
export type RailBatch = {
  id: number;
  query: string;
  replayed: boolean;
  startedAt: number;
  /** wall time of the finished run — the verdict's own `ms`, so the header matches the drawer exactly */
  ms?: number;
};

const CAP = 200;

type Seed = { query: string; calls: Call[]; replayed: boolean; ms?: number };

function seedState(seed?: Seed): { rows: RailRow[]; batches: RailBatch[] } {
  if (!seed) return { rows: [], batches: [] };
  const now = Date.now();
  const batch: RailBatch = { id: 1, query: seed.query, replayed: seed.replayed, startedAt: now, ms: seed.ms };
  const rows = seed.calls.map<RailRow>((call, i) => ({
    id: `1:${i}`,
    batch: 1,
    endpoint: call.endpoint,
    body: call.body,
    status: statusOf(call),
    call,
    startedAt: now,
    replayed: seed.replayed,
  }));
  return { rows, batches: [batch] };
}

export function statusOf(call: Call): RailStatus {
  return !call.ok ? "error" : call.cached ? "cached" : "live";
}

/** Credits a row cost THIS session: a replayed row cost nothing now (its recorded cost is in the fixture). */
export function creditsOf(r: RailRow): number {
  return r.replayed ? 0 : (r.call?.credits ?? 0);
}

/** Rail state: rows accumulate across queries in the session (cap 200, oldest dropped); `clear` resets. */
export function useRail(seed?: Seed) {
  const [state, setState] = useState(() => seedState(seed));
  const nextBatch = useRef(state.batches.length + 1);

  /** A new query starts a batch; rows still pending from an abandoned stream are dropped (they never landed here). */
  const begin = useCallback((query: string, replayed = false) => {
    const id = nextBatch.current++;
    setState((s) => ({
      rows: s.rows.filter((r) => r.status !== "pending"),
      batches: [...s.batches, { id, query, replayed, startedAt: Date.now() }],
    }));
    return id;
  }, []);

  const onEvent = useCallback((batch: number, e: CallEvent) => {
    setState((s) => {
      if (e.type === "call:start") {
        const row: RailRow = { id: `${batch}:${e.seq}`, batch, endpoint: e.endpoint, body: e.body, status: "pending", startedAt: e.startedAt, replayed: false };
        const rows = [...s.rows, row];
        return { ...s, rows: rows.length > CAP ? rows.slice(rows.length - CAP) : rows };
      }
      const id = `${batch}:${e.seq}`;
      const i = s.rows.findIndex((r) => r.id === id);
      const done: RailRow = {
        id,
        batch,
        endpoint: e.call.endpoint,
        body: e.call.body,
        status: statusOf(e.call),
        call: e.call,
        startedAt: s.rows[i]?.startedAt ?? Date.now(),
        replayed: false,
      };
      const rows = i >= 0 ? s.rows.map((r, j) => (j === i ? done : r)) : [...s.rows, done];
      return { ...s, rows };
    });
  }, []);

  /** The verdict landed: pin the batch's wall time to the verdict's own `ms`. */
  const finish = useCallback((batch: number, ms: number) => {
    setState((s) => ({ ...s, batches: s.batches.map((b) => (b.id === batch ? { ...b, ms } : b)) }));
  }, []);

  const clear = useCallback(() => setState({ rows: [], batches: [] }), []);

  return { rows: state.rows, batches: state.batches, begin, onEvent, finish, clear };
}

/** One-line request summary — never the key, never a full body. */
export function summarize(endpoint: string, body: Record<string, unknown>, symbolOf: (address: string) => string | undefined): string {
  const chain = typeof body.chain === "string" ? body.chain : undefined;
  if (endpoint === "search/general") return `“${String(body.search_query ?? "")}” · ${String(body.result_type ?? "token")}s${chain ? ` · ${chain}` : ""}`;
  const address = typeof body.token_address === "string" ? body.token_address : "";
  const who = symbolOf(address) ?? (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address || "—");
  if (endpoint === "tgm/holders") {
    const per = (body.pagination as { per_page?: number } | undefined)?.per_page ?? 20;
    return `${who} · ${chain ?? "—"} · top ${per} holders`;
  }
  return `${who} · ${chain ?? "—"}${typeof body.timeframe === "string" ? ` · ${body.timeframe}` : ""}`;
}

const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Count-up over 240 ms (--ease-like cubic out); instant under prefers-reduced-motion. */
function useCountUp(target: number, ms = 240): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || reduceMotion()) {
      from.current = target;
      const id = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (target - start) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

export function Rail({
  rows,
  batches,
  running,
  symbolOf,
  onClear,
  onRunExample,
  exampleQuery,
}: {
  rows: RailRow[];
  batches: RailBatch[];
  /** a live stream is in flight — the wall clock ticks */
  running: boolean;
  symbolOf: (address: string) => string | undefined;
  onClear: () => void;
  onRunExample?: () => void;
  exampleQuery?: string;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  // wall clock while a run is in flight (100 ms); the verdict's own ms replaces it the moment the run ends
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  const clock = running && now != null ? now : null;

  // oldest at top, auto-scroll to the newest row unless the reader has scrolled up to study earlier ones
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [rows.length, open]);

  const current = batches[batches.length - 1];
  const inBatch = current ? rows.filter((r) => r.batch === current.id) : [];
  const calls = inBatch.length;
  const credits = inBatch.reduce((n, r) => n + creditsOf(r), 0);
  const elapsed =
    current && !current.replayed
      ? current.ms != null
        ? current.ms / 1000
        : running
          ? Math.max(0, ((clock ?? current.startedAt) - current.startedAt) / 1000)
          : 0
      : null;
  const sessionCalls = rows.length;
  const sessionCredits = rows.reduce((n, r) => n + creditsOf(r), 0);
  const nCalls = useCountUp(calls);
  const nCredits = useCountUp(credits);
  const nSessionCredits = useCountUp(sessionCredits);

  const counters = (
    <dl className="rail-counters" aria-label="totals for the current run">
      <div>
        <dt>calls</dt>
        <dd>{nCalls}</dd>
      </div>
      <div>
        <dt>credits</dt>
        <dd>{nCredits}</dd>
      </div>
      <div>
        <dt>{current?.replayed ? "source" : "wall time"}</dt>
        <dd className={current?.replayed ? "rail-dd-text" : ""}>{current?.replayed ? "replayed" : `${(elapsed ?? 0).toFixed(1)} s`}</dd>
      </div>
    </dl>
  );

  return (
    <aside className={`rail ${open ? "open" : ""}`} aria-label="Nansen API calls" aria-live="polite">
      <button type="button" className="rail-bar" aria-expanded={open} aria-controls="rail-body" onClick={() => setOpen((o) => !o)}>
        <span className="rail-bar-dot" aria-hidden />
        <span>
          Nansen calls · <b>{nCalls}</b> · <b>{nCredits}</b> cr{running ? " · live" : current?.replayed ? " · replayed" : ""}
        </span>
        <span className="rail-chevron" aria-hidden>
          {open ? "▾" : "▴"}
        </span>
      </button>
      <div className="rail-body" id="rail-body">
        <header className="rail-head">
          <div className="rail-title-row">
            <span className="kicker">Nansen API</span>
            <span className="rail-title">Live call log</span>
            {rows.length > 0 && (
              <button type="button" className="rail-clear" onClick={onClear}>
                clear
              </button>
            )}
          </div>
          {counters}
        </header>
        <ol
          className="rail-list"
          ref={listRef}
          aria-live="off"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
        >
          {rows.length === 0 && (
            <li className="rail-empty">
              No calls yet —{" "}
              {onRunExample ? (
                <button type="button" className="rail-link" onClick={onRunExample}>
                  run the example live
                </button>
              ) : (
                "type a ticker and press Check"
              )}
              {exampleQuery && onRunExample ? ` (${exampleQuery}, ≤ 26 credits)` : ""}
            </li>
          )}
          {rows.flatMap((r, i) => {
            const batch = batches.find((b) => b.id === r.batch);
            const first = i === 0 || rows[i - 1].batch !== r.batch;
            const items = [];
            if (first && batch)
              items.push(
                <li key={`b${batch.id}`} className="rail-batch" aria-hidden>
                  {batch.query} · {batch.replayed ? "example · replayed from fixtures" : "live"}
                </li>,
              );
            items.push(
              <li key={r.id} className={`rail-row ${r.status}`} data-batch={r.batch}>
                <div className="rail-line">
                  <span className={`rail-dot ${r.status}`} aria-hidden />
                  <div className="rail-main">
                    <div className="rail-ep">
                      <span className="rail-method">POST</span>
                      {r.endpoint}
                    </div>
                    <div className="rail-params">{summarize(r.endpoint, r.body, symbolOf)}</div>
                  </div>
                  <span className={`rail-cr ${r.status}`}>
                    {r.status === "pending"
                      ? "…"
                      : r.replayed
                        ? "replayed · 0 cr"
                        : r.status === "cached"
                          ? "0 cr · cached"
                          : r.status === "error"
                            ? "0 cr · failed"
                            : `${r.call!.credits} cr`}
                  </span>
                  <span className="rail-ms">
                    {r.status === "pending"
                      ? "pending"
                      : r.status === "error"
                        ? r.call!.status
                          ? `HTTP ${r.call!.status}`
                          : r.call!.error === "timeout"
                            ? "timeout"
                            : "failed"
                        : r.status === "cached"
                          ? "0 ms"
                          : `${r.call!.ms} ms${r.call!.attempts > 1 ? ` ×${r.call!.attempts}` : ""}`}
                    {r.call?.responseHash ? (
                      <span className="rail-hash" title={`sha256 ${r.call.responseHash}`}>
                        {" "}
                        · sha256 {r.call.responseHash.slice(0, 4)}…
                      </span>
                    ) : null}
                  </span>
                </div>
              </li>,
            );
            return items;
          })}
        </ol>
        <footer className="rail-foot">
          <span>
            session · {sessionCalls} call{sessionCalls === 1 ? "" : "s"} · {nSessionCredits} credit{sessionCredits === 1 ? "" : "s"}
          </span>
          <a href={`${REPO}#-nansen-integration`} target="_blank" rel="noreferrer">
            same calls: <code>--explain</code> in the CLI
          </a>
        </footer>
      </div>
    </aside>
  );
}
