import { createHash } from "node:crypto";

/** Every Nansen call the engine makes, recorded for the provenance drawer and `--explain`. */
export type Call = {
  endpoint: string;
  body: Record<string, unknown>;
  credits: number;
  ms: number;
  cached: boolean;
  status: number;
  fieldsUsed: string[];
  /** sha256 of the raw response body — verify.ts compares live vs fixture. */
  responseHash: string;
};

export type ClientOptions = {
  baseUrl?: string;
  /** requests per second, client-side burst cap (Nansen: 300/min) */
  rps?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/** Credit cost per endpoint (docs.nansen.ai credits table, 2026-09-16). Unknown endpoints count as 1. */
export const CREDITS: Record<string, number> = {
  "search/general": 0,
  "tgm/flow-intelligence": 1,
  "tgm/token-information": 1,
  "tgm/holders": 5,
  "tgm/indicators": 5,
};

export class NansenError extends Error {
  constructor(
    public endpoint: string,
    public status: number,
    public bodyText: string,
  ) {
    super(`Nansen ${endpoint} → HTTP ${status}: ${bodyText.slice(0, 200)}`);
  }
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Minimal token bucket: at most `rps` requests per rolling second. */
class RateLimiter {
  private timestamps: number[] = [];
  constructor(private rps: number) {}
  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < 1000);
      if (this.timestamps.length < this.rps) {
        this.timestamps.push(now);
        return;
      }
      await new Promise((r) => setTimeout(r, 1000 - (now - this.timestamps[0]) + 5));
    }
  }
}

export class NansenClient {
  private baseUrl: string;
  private limiter: RateLimiter;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  /** Every call made through this client, in order. */
  readonly calls: Call[] = [];

  constructor(
    private apiKey: string,
    opts: ClientOptions = {},
  ) {
    if (!apiKey || !apiKey.startsWith("nsn_")) {
      throw new Error("NANSEN_API_KEY missing or malformed (expected nsn_…)");
    }
    this.baseUrl = opts.baseUrl ?? "https://api.nansen.ai/api/v1";
    this.limiter = new RateLimiter(opts.rps ?? 10); // Nansen cap is 300/min; a 10 rps burst on ≤26 calls stays far under it
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** POST `endpoint` with a JSON body; one retry on 429/5xx; records the call. */
  async post<T = unknown>(endpoint: string, body: Record<string, unknown>, fieldsUsed: string[] = []): Promise<T> {
    const { text, ms, status } = await this.postRaw(endpoint, body);
    this.calls.push({ endpoint, body, credits: CREDITS[endpoint] ?? 1, ms, cached: false, status, fieldsUsed, responseHash: sha256(text) });
    return JSON.parse(text) as T;
  }

  /** The network call itself, returning the raw body so callers (and the cache) hash exactly what Nansen sent. */
  protected async postRaw(endpoint: string, body: Record<string, unknown>): Promise<{ text: string; ms: number; status: number }> {
    const url = `${this.baseUrl}/${endpoint}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.limiter.take();
      const started = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { apikey: this.apiKey, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const text = await res.text();
        const ms = Date.now() - started;
        if (res.status === 429 || res.status >= 500) {
          lastErr = new NansenError(endpoint, res.status, text);
          if (attempt === 0) { await new Promise((r) => setTimeout(r, 750)); continue; }
          throw lastErr;
        }
        if (!res.ok) throw new NansenError(endpoint, res.status, text);
        return { text, ms, status: res.status };
      } catch (e) {
        lastErr = e;
        if (attempt === 1 || !(e instanceof Error && e.name === "AbortError")) throw e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  /** Credits spent through this client so far (from the static cost table). */
  get creditsSpent(): number {
    return this.calls.reduce((n, c) => n + c.credits, 0);
  }
}

/** Load the key from the environment; `source ~/.config/nansen/meridian.env` first. */
export function clientFromEnv(opts?: ClientOptions): NansenClient {
  const key = process.env.NANSEN_API_KEY ?? "";
  return new NansenClient(key, opts);
}
