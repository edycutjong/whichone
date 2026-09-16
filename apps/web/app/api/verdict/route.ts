import { NextRequest } from "next/server";
import { verdictFor, SAFE_QUERY, CHAINS } from "@/lib/engine";
import type { VerdictEvent } from "@whichone/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/verdict?q=PEPE[&chain=base]            → Verdict JSON
 * GET /api/verdict?q=PEPE&stream=1                → NDJSON: {type:candidates} · {type:scored}×N · {type:verdict}
 * The stream is what the page renders: cards appear pending, reorder as each candidate's Nansen facts land, then one
 * turns green. Same engine, same hash as the CLI.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const q = (url.searchParams.get("q") ?? "").trim();
  const chainParam = url.searchParams.get("chain") ?? undefined;
  const chain = chainParam && (CHAINS as readonly string[]).includes(chainParam) ? chainParam : undefined;
  if (!SAFE_QUERY.test(q)) return Response.json({ error: "query must be 1–32 letters, digits, spaces or . _ $ -" }, { status: 400 });
  if (!process.env.NANSEN_API_KEY) return Response.json({ error: "server has no NANSEN_API_KEY" }, { status: 500 });

  if (url.searchParams.get("stream") !== "1") {
    try {
      const { verdict, oldestHit } = await verdictFor(q, chain);
      return Response.json({ ...verdict, asOf: oldestHit ?? null }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: VerdictEvent | { type: "error"; message: string } | { type: "asOf"; asOf: string | null }) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        const { oldestHit } = await verdictFor(q, chain, { onProgress: send });
        send({ type: "asOf", asOf: oldestHit ?? null });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
