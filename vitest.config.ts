import { defineConfig } from "vitest/config";
export default defineConfig({
  // guard.test.ts renders the /api/og route (TSX) — use the automatic JSX runtime, as next build does
  // Vite 8 (vitest ≥ 4) transforms with oxc and would keep Next's `jsx: preserve`; Vite ≤ 7 reads the esbuild key
  oxc: { jsx: { runtime: "automatic" } },
  esbuild: { jsx: "automatic" },
  test: {
    // fast-check property suites run 10,000+ cases; 5 s is too tight on a loaded runner
    testTimeout: 60_000,
    include: ["packages/**/test/**/*.test.ts"],
    environment: "node",
    coverage: { provider: "v8", include: ["packages/core/src/**"], reporter: ["text", "html", "lcov"], reportsDirectory: "coverage" },
  },
  resolve: {
    alias: {
      "@whichone/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      // the boundary test drives the web app's route handlers directly (apps/web uses `@/` for its own root)
      "@": new URL("./apps/web", import.meta.url).pathname,
    },
  },
});
