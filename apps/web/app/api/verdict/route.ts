import { NextRequest } from "next/server";
import { verdictFor, SAFE_QUERY, CHAINS } from "@/lib/engine";
import { clientIp, ipAllowed, budgetExhausted, recordSpend, replayFixture, NO_FIXTURE_MESSAGE } from "@/lib/guard";
import type { VerdictEvent } from "@whichone/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/verdict?q=PEPE[&chain=base]            → Verdict JSON
 * GET /api/verdict?q=PEPE&stream=1                → NDJSON: {type:candidates} · {type:scored}×N · {type:verdict}
 * The stream is what the page renders: cards appear pending, reorder as each candidate's Nansen facts land, then one
 * turns green. Same engine, same hash as the CLI.
 * Spend guard (lib/guard.ts): 429 past the per-IP rate, and past the daily credit ceiling a recorded fixture replays
 * at 0 credits (labelled in `warnings`, `degraded: true`) or the request gets a 503 that says why.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const q = (url.searchParams.get("q") ?? "").trim();
  const chainParam = url.searchParams.get("chain") ?? undefined;
  const chain = chainParam && (CHAINS as readonly string[]).includes(chainParam) ? chainParam : undefined;
  if (!SAFE_QUERY.test(q)) return Response.json({ error: "query must be 1–44 letters, digits, spaces or . _ $ -" }, { status: 400 });
  if (!process.env.NANSEN_API_KEY) return Response.json({ error: "server has no NANSEN_API_KEY" }, { status: 500 });
  const gate = ipAllowed(clientIp(req.headers));
  if (!gate.ok) {
    return Response.json({ error: `Too many verdicts from this address — try again in ${gate.retryAfter} s` }, { status: 429, headers: { "retry-after": String(gate.retryAfter), "cache-control": "no-store" } });
  }
  const degraded = budgetExhausted();

  if (url.searchParams.get("stream") !== "1") {
    try {
      const r = degraded ? await replayFixture(q, chain) : await verdictFor(q, chain);
      if (!r) return Response.json({ error: NO_FIXTURE_MESSAGE }, { status: 503, headers: { "retry-after": "3600", "cache-control": "no-store" } });
      if (!degraded) recordSpend(r.verdict.credits);
      return Response.json({ ...r.verdict, asOf: r.oldestHit ?? null, degraded }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The browser aborts this fetch when the user submits a new ticker mid-stream; after that every enqueue throws,
      // so a closed stream turns `send` into a no-op and the verdict simply finishes unobserved.
      let closed = false;
      const send = (e: VerdictEvent | { type: "error"; message: string } | { type: "asOf"; asOf: string | null }) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        const r = degraded ? await replayFixture(q, chain, { onProgress: send }) : await verdictFor(q, chain, { onProgress: send });
        if (!r) send({ type: "error", message: NO_FIXTURE_MESSAGE });
        else {
          if (!degraded) recordSpend(r.verdict.credits);
          send({ type: "asOf", asOf: r.oldestHit ?? null });
        }
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
        }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
