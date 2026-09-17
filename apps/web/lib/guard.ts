import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { CachedNansenClient, fixtureName, fixtureStore, readFixture, whichOnesReal, type VerdictOptions } from "@whichone/core";

/**
 * Spend guard for the public /api/verdict route. The key is server-only and every verdict costs real Nansen credits
 * (≤ 26), so an unattended loop against the URL could drain the account. Three ceilings, no new services:
 *
 *   1. per-IP:  IP_PER_MIN verdicts per rolling minute → 429 with Retry-After;
 *   2. global:  DAILY_CREDITS live credits per UTC day, counted from the verdict's own provenance;
 *   3. degrade: past the daily ceiling a query with a recorded fixture replays it offline (0 credits, labelled), one
 *      without gets a 503 that says so — the page shows the message instead of a crash.
 *
 * Counters live in instance memory: a ceiling, not accounting. Vercel may run several instances, so the true daily
 * spend is bounded by DAILY_CREDITS × instances — still two orders of magnitude under the balance.
 */
export const IP_PER_MIN = Number(process.env.GUARD_IP_PER_MIN ?? 6);
export const DAILY_CREDITS = Number(process.env.GUARD_DAILY_CREDITS ?? 3000);
/** a verdict never costs more than this (cap 8 + 2 holders calls), so we stop when the budget can't cover one */
export const MAX_VERDICT_CREDITS = 26;
const WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip")?.trim() || "unknown";
}

export function ipAllowed(ip: string, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= IP_PER_MIN) {
    hits.set(ip, recent);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  if (hits.size >= 5000) hits.clear(); // bound memory under a distributed scan; a cleared window only errs toward allowing
  hits.set(ip, recent);
  return { ok: true };
}

let day = "";
let spent = 0;
function roll(now: number) {
  const d = new Date(now).toISOString().slice(0, 10);
  if (d !== day) {
    day = d;
    spent = 0;
  }
}
export function creditsLeft(now = Date.now()): number {
  roll(now);
  return Math.max(0, DAILY_CREDITS - spent);
}
export function recordSpend(credits: number, now = Date.now()): void {
  roll(now);
  spent += Math.max(0, credits);
}
/** true when the day's budget cannot cover one more worst-case verdict */
export function budgetExhausted(now = Date.now()): boolean {
  return creditsLeft(now) < MAX_VERDICT_CREDITS;
}
/** test hook */
export function resetGuard(): void {
  hits.clear();
  day = "";
  spent = 0;
}

export const BUDGET_MESSAGE = "Today's live Nansen budget is used up — this is a replay of a recorded run.";
export const NO_FIXTURE_MESSAGE =
  "Today's live Nansen budget is used up and this ticker has no recorded run. Try PEPE, BONK, TRUMP or DOGE, or come back tomorrow.";

function fixturesDir(): string | undefined {
  for (const c of [join(process.cwd(), "fixtures"), join(process.cwd(), "..", "..", "fixtures")]) if (existsSync(c)) return c;
  return undefined;
}

/**
 * The offline fallback: the fixture's recorded responses under the same engine, same clock, so the verdict is the one
 * the live run produced. Returns undefined when no fixture matches the query + chain.
 */
export async function replayFixture(q: string, chain?: string, opts: Omit<VerdictOptions, "chain" | "now"> = {}) {
  const dir = fixturesDir();
  if (!dir) return undefined;
  // `q` is user input: fixtureName() already reduces it to [A-Z0-9_-], and the resolved path is still checked to sit
  // inside the fixtures directory before anything is read (no `..`, no absolute paths, no traversal by construction)
  const root = resolve(dir);
  const path = resolve(root, `${fixtureName(q, chain)}.json`);
  if (!path.startsWith(root + sep) || !existsSync(path)) return undefined;
  const f = readFixture(path);
  const c = new CachedNansenClient("nsn_offline_replay_no_network", { store: fixtureStore(f), offline: true });
  // label the verdict before the stream's final event carries it, so the page shows the replay notice too
  const onProgress: VerdictOptions["onProgress"] = (e) => {
    if (e.type === "verdict" && !e.verdict.warnings.includes(BUDGET_MESSAGE)) e.verdict.warnings.push(BUDGET_MESSAGE);
    opts.onProgress?.(e);
  };
  const verdict = await whichOnesReal(c, q, { chain, now: f.now, cap: f.options.cap, finalists: f.options.finalists, ...opts, onProgress });
  if (!verdict.warnings.includes(BUDGET_MESSAGE)) verdict.warnings.push(BUDGET_MESSAGE);
  return { verdict, oldestHit: c.oldestHit ?? f.recordedAt };
}
