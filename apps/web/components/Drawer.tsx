"use client";
import type { Call } from "@whichone/core";

export function Drawer({
  calls,
  open,
  onClose,
  credits,
  ms,
  asOf,
  hash,
}: {
  calls: Call[];
  open: boolean;
  onClose: () => void;
  credits: number;
  ms: number;
  asOf?: string | null;
  hash?: string;
}) {
  const cached = calls.filter((c) => c.cached).length;
  return (
    <aside className={`drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <h3>
        Every Nansen call behind this verdict{" "}
        <button className="btn" onClick={onClose}>
          close
        </button>
      </h3>
      <table>
        <thead>
          <tr>
            <th>endpoint</th>
            <th>chain</th>
            <th>credits</th>
            <th>ms</th>
            <th>cached</th>
            <th>fields used</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c, i) => (
            <tr key={i} className={c.ok ? "" : "fail"}>
              <td className="mono">
                {c.endpoint}
                {c.attempts > 1 ? ` (×${c.attempts})` : ""}
              </td>
              <td className="mono">{String(c.body.chain ?? "—")}</td>
              <td>{c.credits}</td>
              <td>{c.ok ? c.ms : `${c.totalMs} · ${c.error}`}</td>
              <td>{c.cached ? "yes" : "live"}</td>
              <td className="mono">{c.fieldsUsed.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sum">
        {credits} credits · {calls.length} calls ({cached} cached{asOf ? `, as of ${asOf.slice(11, 16)} UTC` : ""}) · {(ms / 1000).toFixed(1)} s
        {hash ? ` · verdict ${hash.slice(0, 12)}` : ""}
      </p>
      <p className="sum">
        Cached calls cost 0 credits and are labelled. Failed calls are shown, never hidden. The same table prints in the CLI with <code>--explain</code>.
      </p>
    </aside>
  );
}
