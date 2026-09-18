import { describe, expect, it } from "vitest";
import { blend, blendWeights, dispersion, weightedGeometricMean } from "@/lib/engine/blend";
import type { MethodResult } from "@/lib/engine/types";

const m = (
  key: MethodResult["key"],
  valuationUsd: number,
  weightHint = 1,
  applicable = true,
): MethodResult => ({
  key,
  name: key,
  valuationUsd,
  applicable,
  weightHint,
  inputsUsed: {},
  notes: [],
});

describe("blend", () => {
  it("weighted geometric mean of $1M and $4M at equal weight is $2M (arithmetic would be $2.5M)", () => {
    expect(weightedGeometricMean([1e6, 4e6], [0.5, 0.5])).toBeCloseTo(2e6, 3);
    expect(weightedGeometricMean([1e6, 4e6], [1, 0])).toBeCloseTo(1e6, 3);
  });

  it("stage presets × weight hints, renormalised; inapplicable and zero-preset methods drop out", () => {
    const w = blendWeights(
      [
        m("scorecard", 3e6),
        m("berkus", 2e6),
        m("rfs", 5e6),
        m("vc", 0, 0, false),
        m("multiples", 1e6),
        m("anchor", 3.8e6, 0.2),
      ],
      "pre_seed",
    );
    // pre_seed presets: 30, 20, 20, (vc n/a), 5, 10×0.2 = 2 → total 77
    expect(w.scorecard).toBeCloseTo(30 / 77, 6);
    expect(w.berkus).toBeCloseTo(20 / 77, 6);
    expect(w.rfs).toBeCloseTo(20 / 77, 6);
    expect(w.multiples).toBeCloseTo(5 / 77, 6);
    expect(w.anchor).toBeCloseTo(2 / 77, 6);
    expect(w.vc).toBeUndefined();
    expect(Object.values(w).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
    // idea stage gives multiples and anchor zero preset weight
    const idea = blendWeights([m("scorecard", 1e6), m("multiples", 1e6), m("anchor", 1e6)], "idea");
    expect(idea.multiples).toBeUndefined();
    expect(idea.anchor).toBeUndefined();
    expect(idea.scorecard).toBe(1);
  });

  it("dispersion is the coefficient of variation × 100, clamped", () => {
    expect(dispersion([1e6, 1e6])).toBe(0);
    expect(dispersion([1e6, 3e6])).toBe(50);
    expect(dispersion([1e6])).toBe(0);
    expect(dispersion([0, 0, 0, 1e9])).toBe(100); // CV 173 → clamped
  });

  it("wide range (×0.55 / ×1.70) and a flag when confidence < 50", () => {
    const r = blend([m("scorecard", 1e6), m("berkus", 9e6)], "idea");
    // CV = 4/5 = 80 → confidence 20
    expect(r.confidence).toBe(20);
    expect(r.flags).toContain("low_confidence_wide_range");
    expect(r.lowUsd).toBe(Math.round(r.blendedUsd * 0.55));
    expect(r.highUsd).toBe(Math.round(r.blendedUsd * 1.7));
  });

  it("normal range (×0.70 / ×1.40) when methods agree", () => {
    const r = blend([m("scorecard", 2e6), m("berkus", 2.2e6), m("rfs", 1.9e6)], "idea");
    expect(r.confidence).toBeGreaterThanOrEqual(90);
    expect(r.lowUsd).toBe(Math.round(r.blendedUsd * 0.7));
    expect(r.highUsd).toBe(Math.round(r.blendedUsd * 1.4));
    expect(r.flags).not.toContain("low_confidence_wide_range");
  });

  it("floors a degenerate method at $50k inside the log blend and flags it", () => {
    const r = blend([m("scorecard", 2e6), m("vc", 100)], "seed");
    expect(r.flags).toContain("method_floored:vc");
    expect(r.blendedUsd).toBeGreaterThan(0);
  });
});
