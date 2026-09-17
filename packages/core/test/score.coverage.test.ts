import { describe, it, expect } from "vitest";
import { score } from "../src/score.js";
import { facts } from "./helpers.js";

describe("score() coverage gap: fmtInt millions branch", () => {
  it("formats a holder count of 1M+ as '<N>.<N>M holders' instead of the K or bare-number arms", () => {
    const s = score(facts({ totalHolders: 1_500_000 }));
    expect(s.reasons).toContain("1.5M holders");
  });
});
