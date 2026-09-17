import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
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
