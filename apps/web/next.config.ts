import type { NextConfig } from "next";

const config: NextConfig = {
  // the engine is imported straight from packages/core/src (TypeScript) — one verdict function for CLI and web
  transpilePackages: ["@whichone/core"],
  // `npm run lint` (flat config at the repo root, Stage 1 of CI) owns linting; next build only type-checks
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  // lib/guard.ts replays a recorded fixture once the day's live credit budget is spent — ship them with the function
  outputFileTracingIncludes: { "/api/verdict": ["../../fixtures/*.json"] },
  // packages/core uses ESM-style `./x.js` specifiers for .ts files (what tsx/vitest expect); teach webpack the same
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
  turbopack: { resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"] },
};
export default config;
