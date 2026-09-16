import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { verdictFor, SAFE_QUERY, CHAINS } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** 1200×630 share card: the green winner and the next two cards, plus the verdict hash. Served from the cache after the first hit. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "PEPE").trim();
  const chainParam = req.nextUrl.searchParams.get("chain") ?? undefined;
  const chain = chainParam && (CHAINS as readonly string[]).includes(chainParam) ? chainParam : undefined;
  if (!SAFE_QUERY.test(q)) return new Response("bad query", { status: 400 });
  let rows: { chain: string; address: string; reason: string; state: "winner" | "impostor" | "grey" }[] = [];
  let headline = `Which ${q} is real?`;
  let sub = "";
  let hash = "";
  try {
    const { verdict: v } = await verdictFor(q, chain);
    hash = v.hash.slice(0, 12);
    if (v.abstained) { headline = `No ${q} looks real`; sub = v.abstainReason ?? ""; }
    else { headline = `1 of ${v.candidatesTotal} ${q} is real`; sub = `${v.winner!.chain} · ${v.winner!.address}`; }
    rows = v.ranked.slice(0, 3).map((s) => ({ chain: s.chain, address: s.address, reason: s.reasons.filter((r) => !r.startsWith("IMPOSTOR")).slice(0, 2).join(" · "), state: v.winner && s.chain === v.winner.chain && s.address === v.winner.address ? "winner" : s.impostor ? "impostor" : "grey" }));
  } catch (e) {
    sub = `Nansen lookup failed: ${(e as Error).message.slice(0, 80)}`;
  }
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: "#0B0F14", color: "#E6EDF3", padding: 56, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 56, fontWeight: 700 }}>{headline}</div>
        <div style={{ fontSize: 24, color: "#8B9BAB", marginTop: 8, fontFamily: "monospace" }}>{sub}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 36 }}>
          {rows.map((r) => (
            <div key={r.chain + r.address} style={{ display: "flex", alignItems: "center", gap: 20, padding: "18px 24px", borderRadius: 16, background: "#131A22", border: `3px solid ${r.state === "winner" ? "#22C55E" : "#22303D"}`, opacity: r.state === "grey" ? 0.6 : 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, padding: "6px 12px", borderRadius: 8, background: r.state === "winner" ? "#22C55E" : r.state === "impostor" ? "#EF4444" : "#22303D", color: r.state === "grey" ? "#E6EDF3" : "#04150A" }}>{r.state === "winner" ? "REAL" : r.state === "impostor" ? "IMPOSTOR" : r.chain}</div>
              <div style={{ fontSize: 26, fontFamily: "monospace" }}>{`${r.chain} ${short(r.address)}`}</div>
              <div style={{ fontSize: 20, color: "#8B9BAB", marginLeft: "auto", maxWidth: 520 }}>{r.reason}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 20, color: "#8B9BAB" }}>
          <span>whichone · ranked by Nansen labels, not market cap</span>
          <span style={{ fontFamily: "monospace" }}>{hash ? `verdict ${hash}` : ""}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
