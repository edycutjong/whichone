/**
 * Submission readiness: the repo a judge clones must have no placeholders, a README whose claims match the tree
 * (test count, fixture count), every mandatory file, and links that resolve. Exit 1 on any failure.
 *
 *   npm run check
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const fails: string[] = [];
const ok = (cond: unknown, msg: string) => {
  if (!cond) fails.push(msg);
  else console.log(`✔ ${msg}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const MUST = [
  "README.md",
  "DEMO.md",
  "ARCHITECTURE.md",
  "LICENSE",
  "docs/SCORING.md",
  "docs/BENCH.md",
  "docs/DX-REPORT.md",
  ".github/workflows/ci.yml",
  "scripts/seed.ts",
  "scripts/verify.ts",
  "scripts/bench.ts",
  "packages/core/src/verdict.ts",
  "packages/cli/src/cli.ts",
  "apps/web/app/page.tsx",
  "apps/web/app/api/verdict/route.ts",
  "apps/web/app/api/og/route.tsx",
  // the judge surface and the engineering harness (/enhance-project, 2026-09-17)
  "JUDGE.md",
  "apps/web/app/judge/page.tsx",
  "playwright.config.ts",
  "e2e/judge-route.spec.ts",
  "e2e/demo-mode.spec.ts",
  "e2e/verdict-flow.spec.ts",
  "e2e/responsive.spec.ts",
  "lighthouserc.json",
  "packages/core/test/property.test.ts",
  "packages/core/test/boundary.test.ts",
  ".github/workflows/codeql.yml",
  ".github/workflows/gitleaks.yml",
  ".github/workflows/release.yml",
  ".github/dependabot.yml",
  ".github/SECURITY.md",
  ".github/CONTRIBUTING.md",
  ".github/CODE_OF_CONDUCT.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
  ".env.example",
];
for (const f of MUST) ok(existsSync(f), `exists: ${f}`);

const readme = read("README.md");
for (const bad of ["TODO", "TBD", "lorem", "xxx", "PLACEHOLDER", "<your", "coming soon"]) ok(!new RegExp(bad, "i").test(readme), `README has no "${bad}"`);
for (const section of ["Run it in under 10 minutes", "Nansen Integration", "Honesty", "Why only Nansen", "Honest limits"])
  ok(readme.includes(section), `README section: ${section}`);

// test count claimed in README = tests vitest actually runs (it.each rows included), taken from vitest's JSON reporter
const claimed = Number((readme.match(/tests-(\d+)%20passing/) ?? [])[1] ?? 0);
const report = join(tmpdir(), `whichone-vitest-${process.pid}.json`);
execSync(`npx vitest run --reporter=json --outputFile=${report}`, { stdio: "ignore" });
const vitest = JSON.parse(readFileSync(report, "utf8")) as { numTotalTests: number; numPassedTests: number };
const actual = vitest.numTotalTests;
ok(vitest.numPassedTests === actual, `all ${actual} tests pass`);
ok(claimed === actual, `README claims ${claimed} tests; vitest runs ${actual}`);
ok(readme.includes(`**${actual} tests**`), `README prose states ${actual} tests`);
ok(read("JUDGE.md").includes(`**${actual} tests**`), `JUDGE.md states ${actual} tests`);
ok(read("apps/web/app/judge/page.tsx").includes(`TEST_COUNT = ${actual};`), `/judge page states ${actual} tests`);

const fixtures = readdirSync("fixtures").filter((f) => f.endsWith(".json")).length;
ok(readme.includes(`${fixtures}%2F${fixtures}`), `README badge says ${fixtures}/${fixtures} fixtures`);

// kitchen and secrets never in the tree that is committed
const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n");
for (const bad of ["CLAUDE.md", "AGENTS.md", ".claude/", "specs/", "PROGRESS.md", "project.json", ".env", ".cache/"])
  ok(!tracked.filter((f) => f !== ".env.example").some((f) => f === bad || f.startsWith(bad) || f.includes(`/${bad}`)), `not tracked: ${bad}`);
const leaks = execSync("git log -p --all | grep -c 'nsn_[A-Za-z0-9]\\{20,\\}' || true", { encoding: "utf8" }).trim();
ok(leaks === "0", `no API key in git history (${leaks} hits)`);
for (const f of readdirSync("fixtures")) ok(!/nsn_[A-Za-z0-9]{20,}/.test(read(`fixtures/${f}`)), `fixture clean: ${f}`);

// screenshots referenced by the README exist
for (const m of readme.matchAll(/docs\/screenshots\/([\w.-]+)/g)) ok(existsSync(`docs/screenshots/${m[1]}`), `screenshot: ${m[1]}`);

// links resolve (network; skipped in CI without INTERNET=1)
if (process.env.CHECK_LINKS === "1") {
  const links = [...new Set([...readme.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]))];
  for (const url of links) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      ok(res.status < 400, `link ${res.status}: ${url}`);
    } catch (e) {
      fails.push(`link failed: ${url} (${(e as Error).message})`);
    }
  }
}

console.log(
  fails.length
    ? `\n✖ ${fails.length} problem(s):\n${fails.map((f) => `  - ${f}`).join("\n")}`
    : `\nready: ${MUST.length} files, ${actual} tests, ${fixtures} fixtures, history clean`,
);
process.exit(fails.length ? 1 : 0);
