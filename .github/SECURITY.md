# Security Policy

## Supported Versions
| Version | Supported |
|---|---|
| latest (`main`) | ✅ |

## The concrete claim — and the test that backs it
**The server-side Nansen API key never reaches a client, and malformed input is rejected before any network call.**

This is asserted, not described, in `packages/core/test/boundary.test.ts` and repeated over the wire in
`e2e/demo-mode.spec.ts` / `e2e/judge-route.spec.ts`:

- a full verdict, every NDJSON stream event, the provenance log and the cache keys contain nothing key-shaped (`nsn_…`);
- the cached client stores responses under content-addressed keys, so a shared cache directory never holds the key;
- a Nansen HTTP error surfaces the endpoint and status, never request headers;
- a missing or malformed key is refused at client construction;
- `/api/verdict` returns **400** for every string that fails `SAFE_QUERY` — 7 named cases plus **10,000 generated
  queries** (fast-check) — with **zero** `fetch` calls, and an honest **500** naming `NANSEN_API_KEY` when the server has
  no key (again zero fetches);
- the page HTML, the JSON API, the NDJSON stream and the OG image route are fetched from the built app in CI with no key
  and asserted to contain no `nsn_` string.

Secrets live in the environment only (`.env` is git-ignored; `.env.example` holds the names). `gitleaks` scans the
full history on every push; TruffleHog runs in Stage 2 of CI; `npm run check` greps the entire git history for
`nsn_` keys and fails on any hit.

## Reporting a Vulnerability
Please **do not** open a public issue for security vulnerabilities. Instead, report them privately:

- Email **edy.cu@live.com**, or
- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) (Security → Report a vulnerability).

You'll get an acknowledgment within 48 hours and a resolution timeline after
triage. Please give us a reasonable window to patch before public disclosure.
