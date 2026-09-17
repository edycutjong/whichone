import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { verdictFor, SAFE_QUERY, CHAINS } from "@/lib/engine";
import { clientIp, ipAllowed, budgetExhausted, recordSpend, replayFixture } from "@/lib/guard";

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
  let sub: string;
  let hash = "";
  try {
    // same spend guard as /api/verdict — but an image never 4xxs (a scraper would drop the card): past the per-IP rate
    // or the daily ceiling the card comes from a recorded fixture, or falls through to the data-free layout below
    const live = ipAllowed(clientIp(req.headers)).ok && !budgetExhausted();
    const r = live ? await verdictFor(q, chain) : await replayFixture(q, chain);
    if (!r) throw new Error("no live budget and no recorded run");
    if (live) recordSpend(r.verdict.credits);
    const v = r.verdict;
    hash = v.hash.slice(0, 12);
    if (v.abstained) {
      headline = `No ${q} looks real`;
      sub = v.abstainReason ?? "";
    } else {
      headline = `1 of ${v.candidatesTotal} ${q} is real`;
      sub = `${v.winner!.chain} · ${v.winner!.address}`;
    }
    rows = v.ranked.slice(0, 3).map((s) => ({
      chain: s.chain,
      address: s.address,
      reason: s.reasons
        .filter((r) => !r.startsWith("IMPOSTOR"))
        .slice(0, 2)
        .join(" · "),
      state: v.winner && s.chain === v.winner.chain && s.address === v.winner.address ? "winner" : s.impostor ? "impostor" : "grey",
    }));
  } catch (e) {
    sub = `Nansen lookup failed: ${(e as Error).message.slice(0, 80)}`;
  }
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        background: "#0B0F14",
        color: "#E6EDF3",
        padding: 56,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 56, fontWeight: 700 }}>{headline}</div>
      <div style={{ fontSize: 24, color: "#8B9BAB", marginTop: 8, fontFamily: "monospace" }}>{sub}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 36 }}>
        {rows.map((r) => (
          <div
            key={r.chain + r.address}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "18px 24px",
              borderRadius: 16,
              background: "#131A22",
              border: `3px solid ${r.state === "winner" ? "#22C55E" : "#22303D"}`,
              opacity: r.state === "grey" ? 0.6 : 1,
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: 8,
                background: r.state === "winner" ? "#22C55E" : r.state === "impostor" ? "#EF4444" : "#22303D",
                color: r.state === "grey" ? "#E6EDF3" : "#04150A",
              }}
            >
              {r.state === "winner" ? "REAL" : r.state === "impostor" ? "IMPOSTOR" : r.chain}
            </div>
            <div style={{ fontSize: 26, fontFamily: "monospace" }}>{`${r.chain} ${short(r.address)}`}</div>
            <div style={{ fontSize: 20, color: "#8B9BAB", marginLeft: "auto", maxWidth: 520 }}>{r.reason}</div>
          </div>
        ))}
      </div>
      {/* footer: brand + provenance left, a button-shaped call to action + the bare domain right (the two things that still
          read at feed-thumbnail size) — everything stays inside a 48 px inset so a 2:1 centre crop keeps it */}
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", fontSize: 20, color: "#8B9BAB" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginRight: 14 }}>
          <div style={{ width: 30, height: 7, borderRadius: 2, background: "#334155" }} />
          <div style={{ width: 30, height: 7, borderRadius: 2, background: "#22C55E" }} />
          <div style={{ width: 30, height: 7, borderRadius: 2, background: "#334155" }} />
        </div>
        <span style={{ color: "#E6EDF3", fontWeight: 700, marginRight: 10 }}>whichone</span>
        <span>ranked by Nansen labels, not market cap{hash ? ` · verdict ${hash}` : ""}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: "auto" }}>
          <div style={{ fontSize: 22, color: "#8B9BAB" }}>whichone.edycu.dev</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 22px",
              borderRadius: 999,
              background: "#22C55E",
              color: "#04150A",
              fontSize: 24,
              fontWeight: 700,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}
          >
            Type a ticker →
          </div>
        </div>
      </div>
    </div>,
    // crawlers fetch a shared link 3–5× from different cold instances; let Vercel's edge serve repeats for the cache window
    { width: 1200, height: 630, headers: { "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600" } },
  );
}
