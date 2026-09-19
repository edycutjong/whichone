/**
 * The Nansen call rail (apps/web/components/Rail.tsx) is fed by the NDJSON stream's call:start / call:end events and
 * must agree with the provenance drawer to the credit. These tests pin (1) the stream contract at the route and
 * (2) the rail's pure helpers — the one-line param summary (never the key, never a body) and the credit arithmetic.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { Call, CallEvent } from "../src/index.js";
import { GET as verdictRoute } from "@/app/api/verdict/route";
import { DAILY_CREDITS, recordSpend, resetGuard } from "@/lib/guard";
import { summarize, statusOf, creditsOf, type RailRow } from "@/components/Rail";

const KEY = "nsn_test_key_0000000000000000000000";
const req = (q: string, extra = "", ip = "203.0.113.9") =>
  new NextRequest(`http://localhost:3000/api/verdict?q=${encodeURIComponent(q)}${extra}`, { headers: { "x-forwarded-for": ip } });

describe("stream contract: call events for the rail", () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    resetGuard();
    savedKey = process.env.NANSEN_API_KEY;
    process.env.NANSEN_API_KEY = KEY;
  });
  afterEach(() => {
    resetGuard();
    if (savedKey === undefined) delete process.env.NANSEN_API_KEY;
    else process.env.NANSEN_API_KEY = savedKey;
  });

  it("every Nansen call appears as call:start then call:end, before the verdict; the call:end payloads ARE the verdict's provenance", async () => {
    recordSpend(DAILY_CREDITS); // force the fixture replay path: zero network, zero credits, same event contract
    const res = await verdictRoute(req("PEPE", "&stream=1"));
    expect(res.status).toBe(200);
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as CallEvent | { type: string; verdict?: { provenance: Call[]; credits: number } });
    const starts = lines.filter((e): e is Extract<CallEvent, { type: "call:start" }> => e.type === "call:start");
    const ends = lines.filter((e): e is Extract<CallEvent, { type: "call:end" }> => e.type === "call:end");
    const verdictAt = lines.findIndex((e) => e.type === "verdict");
    expect(starts.length).toBeGreaterThan(0);
    expect(ends.length).toBe(starts.length);
    // pairing: each end has a start with the same seq, endpoint and body, and the start came first
    for (const end of ends) {
      const start = starts.find((s) => s.seq === end.seq)!;
      expect(start).toBeDefined();
      expect(start.endpoint).toBe(end.call.endpoint);
      expect(start.body).toEqual(end.call.body);
      expect(lines.indexOf(start)).toBeLessThan(lines.indexOf(end));
      expect(lines.indexOf(end)).toBeLessThan(verdictAt);
    }
    // the drawer's rows == the rail's rows, in completion order, to the credit
    const provenance = (lines[verdictAt] as { verdict: { provenance: Call[]; credits: number } }).verdict.provenance;
    expect(ends.map((e) => e.call)).toEqual(provenance);
    expect(ends.reduce((n, e) => n + e.call.credits, 0)).toBe((lines[verdictAt] as { verdict: { credits: number } }).verdict.credits);
    // nothing key-shaped anywhere in the stream
    expect(JSON.stringify(lines)).not.toMatch(/nsn_[A-Za-z0-9_]{8,}/);
  });
});

describe("rail helpers", () => {
  const sym = (a: string) => (a === "0xabc" ? "PEPE" : undefined);
  it("summarize: one line per endpoint — query, symbol, chain, timeframe / page — never the whole body", () => {
    expect(summarize("search/general", { search_query: "PEPE", result_type: "token", limit: 50 }, sym)).toBe("“PEPE” · tokens");
    expect(summarize("search/general", { search_query: "PEPE", result_type: "token", chain: "base" }, sym)).toBe("“PEPE” · tokens · base");
    expect(summarize("tgm/flow-intelligence", { chain: "ethereum", token_address: "0xabc", timeframe: "7d" }, sym)).toBe("PEPE · ethereum · 7d");
    expect(summarize("tgm/token-information", { chain: "solana", token_address: "So11111111111111111111111111111111111111112", timeframe: "7d" }, sym)).toBe(
      "So1111…1112 · solana · 7d",
    );
    expect(summarize("tgm/holders", { chain: "bnb", token_address: "0xabc", pagination: { page: 1, per_page: 20 } }, sym)).toBe("PEPE · bnb · top 20 holders");
    expect(summarize("tgm/holders", { chain: "bnb", token_address: "" }, sym)).toBe("— · bnb · top 20 holders");
  });
  it("statusOf / creditsOf: live, cached and failed rows; a replayed row costs 0 this session", () => {
    const base: Call = {
      endpoint: "tgm/holders",
      body: {},
      credits: 5,
      ms: 100,
      cached: false,
      status: 200,
      fieldsUsed: [],
      responseHash: "a",
      attempts: 1,
      totalMs: 100,
      ok: true,
    };
    expect(statusOf(base)).toBe("live");
    expect(statusOf({ ...base, cached: true, credits: 0 })).toBe("cached");
    expect(statusOf({ ...base, ok: false, credits: 0, status: 429 })).toBe("error");
    const row = (over: Partial<RailRow>): RailRow => ({
      id: "1:1",
      batch: 1,
      endpoint: base.endpoint,
      body: {},
      status: "live",
      call: base,
      startedAt: 0,
      replayed: false,
      ...over,
    });
    expect(creditsOf(row({}))).toBe(5);
    expect(creditsOf(row({ replayed: true }))).toBe(0);
    expect(creditsOf(row({ call: undefined, status: "pending" }))).toBe(0);
  });
});
