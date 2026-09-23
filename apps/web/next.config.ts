import type { NextConfig } from "next";

const config: NextConfig = {
  // Next 15 streams <meta> into <body> for non-bot user agents; Lighthouse/PSI only read <head>. The pages are tiny, so
  // give every UA blocking metadata — description/OG land in <head> for everyone, not just the bot allowlist.
  htmlLimitedBots: /./,
  // ~5 KB of CSS: inline it so first paint does not wait on a render-blocking stylesheet request (Lighthouse mobile)
  experimental: { inlineCss: true },
  // the engine is imported straight from packages/core/src (TypeScript) — one verdict function for CLI and web
  transpilePackages: ["@whichone/core"],
  // `npm run lint` (flat config at the repo root, Stage 1 of CI) owns linting; next build only type-checks
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  // lib/guard.ts replays a recorded fixture once the day's live credit budget is spent — ship them with every function
  // that can replay (the verdict route and the share card)
  outputFileTracingIncludes: { "/api/verdict": ["../../fixtures/*.json"], "/api/og": ["../../fixtures/*.json"] },
  // packages/core uses ESM-style `./x.js` specifiers for .ts files (what tsx/vitest expect); teach webpack the same
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
  turbopack: { resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"] },
};
export default config;
