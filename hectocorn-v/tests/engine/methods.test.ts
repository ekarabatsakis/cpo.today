import { describe, expect, it } from "vitest";
import { scorecard, scorecardMultiplier } from "@/lib/engine/methods/scorecard";
import { berkus } from "@/lib/engine/methods/berkus";
import { rfs, rfsRatings } from "@/lib/engine/methods/rfs";
import { annualGrowthFromMom, vcMethod } from "@/lib/engine/methods/vcMethod";
import { growthQuality, multiples } from "@/lib/engine/methods/multiples";
import { anchor, annualStepUp } from "@/lib/engine/methods/anchor";
import { marketCheck } from "@/lib/engine/methods/marketCheck";
import { scoreFromInputs } from "@/lib/engine/scores";
import { detectStage } from "@/lib/engine/stage";
import type { Scores } from "@/lib/engine/types";
import { plugSecure } from "@/lib/schema/examples";
import { AS_OF, makeInput } from "./fixtures";

const NEUTRAL: Scores = {
  team: 50,
  market: 50,
  product: 50,
  traction: 50,
  moat: 50,
  financial: 50,
  deal: 50,
};

describe("A. Scorecard", () => {
  it("multiplier maps 0 → 0.5×, 50 → 1.0×, 100 → 1.5×", () => {
    expect(scorecardMultiplier(0)).toBe(0.5);
    expect(scorecardMultiplier(50)).toBe(1);
    expect(scorecardMultiplier(100)).toBe(1.5);
  });

  it("neutral scores return the stage median × region factor", () => {
    const input = makeInput({ hqRegion: "EU" });
    const r = scorecard(input, "seed", NEUTRAL);
    expect(r.valuationUsd).toBe(9e6 * 0.75);
    expect(r.applicable).toBe(true);
  });

  it("PlugSecure: $2.625M base × 1.2105 = $3,177,563", () => {
    const input = plugSecure();
    const r = scorecard(input, "pre_seed", scoreFromInputs(input));
    // team 1.23×30% + market 1.10×25% + product 1.25×15% + traction 1.04×10% + moat 1.5×10% + deal 1.25×10%
    expect(r.valuationUsd).toBeCloseTo(3_177_562.5, -1);
    expect(r.inputsUsed.weightedMultiplier).toBeCloseTo(1.2105, 4);
  });

  it("is not applicable beyond seed", () => {
    expect(scorecard(makeInput(), "series_a", NEUTRAL).applicable).toBe(false);
    expect(scorecard(makeInput(), "series_a", NEUTRAL).valuationUsd).toBe(0);
  });
});

describe("B. Berkus", () => {
  it("PlugSecure: (60+75+73+75+54)/100 × $750k × 0.75 = $1,895,625", () => {
    const input = plugSecure();
    const r = berkus(input, scoreFromInputs(input));
    expect(r.valuationUsd).toBe(1_895_625);
    expect(r.applicable).toBe(true);
    expect(r.weightHint).toBe(1);
  });

  it("maxes at $3.75M × region for perfect scores", () => {
    const perfect: Scores = {
      ...NEUTRAL,
      team: 100,
      market: 100,
      product: 100,
      deal: 100,
      traction: 100,
    };
    expect(berkus(makeInput({ hqRegion: "US" }), perfect).valuationUsd).toBe(3_750_000);
  });

  it("weight hint drops to 0.5 once ARR > 0 and it is not applicable at ARR ≥ $250k", () => {
    expect(
      berkus(makeInput({ traction: { payingCustomers: 1, arrUsd: 50_000 } }), NEUTRAL).weightHint,
    ).toBe(0.5);
    const big = berkus(makeInput({ traction: { payingCustomers: 1, arrUsd: 300_000 } }), NEUTRAL);
    expect(big.applicable).toBe(false);
    expect(big.valuationUsd).toBe(0);
  });
});

describe("C. Risk-Factor Summation", () => {
  it("baseline nets zero points (software +1, no sales −2, saas exit +1)", () => {
    const input = makeInput();
    const ratings = rfsRatings(input, scoreFromInputs(input));
    expect(ratings).toHaveLength(12);
    expect(ratings.reduce((s, r) => s + r.rating, 0)).toBe(0);
    const r = rfs(input, "idea", scoreFromInputs(input));
    expect(r.valuationUsd).toBe(1_000_000); // base $1.0M × US 1.0, zero points
    expect(r.inputsUsed.pointValueUsd).toBe(100_000); // $250k × (1.0M / 2.5M)
  });

  it("litigation risk costs 3 points (legislation −1, litigation −2)", () => {
    const input = makeInput({ risks: { litigationOrRegulatoryRisk: true } });
    const r = rfs(input, "idea", scoreFromInputs(input));
    expect(r.inputsUsed.totalPoints).toBe(-3);
    expect(r.valuationUsd).toBe(700_000);
  });

  it("PlugSecure: +9 points × $262.5k on a $2.625M base = $4,987,500", () => {
    const input = plugSecure();
    const r = rfs(input, "pre_seed", scoreFromInputs(input));
    expect(r.inputsUsed.totalPoints).toBe(9);
    expect(r.inputsUsed.pointValueUsd).toBe(262_500);
    expect(r.valuationUsd).toBe(4_987_500);
    expect(r.inputsUsed.legislation).toBe(1);
    expect(r.inputsUsed.technology).toBe(2);
    expect(r.inputsUsed.international).toBe(1);
  });

  it("is not applicable beyond seed", () => {
    expect(rfs(makeInput(), "series_b_plus", NEUTRAL).applicable).toBe(false);
  });
});

describe("D. VC Method", () => {
  it("annualises MoM growth and caps at 300%", () => {
    expect(annualGrowthFromMom(10)).toBeCloseTo(1.1 ** 12 - 1, 6);
    expect(annualGrowthFromMom(20)).toBe(3);
    expect(annualGrowthFromMom(0)).toBe(0);
  });

  it("revenue path: $1.2M ARR, Series A defaults → $11.93M pre-money", () => {
    const input = makeInput({ traction: { payingCustomers: 10, arrUsd: 1.2e6 } });
    const r = vcMethod(input, "series_a");
    const revenueAtExit = 1.2e6 * 1.7 ** 5; // 70%/yr for 5 years
    const exit = revenueAtExit * 7; // saas exit multiple
    const post = (exit / 6) * (1 - 0.4);
    expect(r.valuationUsd).toBeCloseTo(post, -1);
    expect(r.applicable).toBe(true);
    expect(r.weightHint).toBe(1); // ARR ≥ $1M
    expect(r.inputsUsed.path).toBe("revenue");
  });

  it("subtracts the target raise when raising", () => {
    const input = makeInput({
      traction: { payingCustomers: 10, arrUsd: 1.2e6 },
      funding: { currentlyRaising: true, targetRaiseUsd: 2e6 },
    });
    const withRaise = vcMethod(input, "series_a").valuationUsd;
    const without = vcMethod(
      makeInput({ traction: { payingCustomers: 10, arrUsd: 1.2e6 } }),
      "series_a",
    ).valuationUsd;
    expect(without - withRaise).toBe(2e6);
  });

  it("pre-revenue path uses min(SOM × 10%, TAM × 0.5%) and floors the pre-money at 10% of post", () => {
    const input = plugSecure();
    input.market.somUsd = 100e6;
    input.market.tamUsd = 5e9;
    const r = vcMethod(input, "pre_seed");
    expect(r.inputsUsed.revenueAtExitUsd).toBe(10e6); // min(10M, 25M)
    expect(r.inputsUsed.exitValueUsd).toBe(80e6); // × 8 cybersecurity
    expect(r.inputsUsed.postMoneyTodayUsd).toBe(1_600_000); // / 20 × 0.4
    expect(r.valuationUsd).toBe(160_000); // 1.6M − 1.5M raise < 10% floor
    expect(r.notes.some((n) => n.includes("floored"))).toBe(true);
    expect(r.weightHint).toBe(0.5); // pre-revenue
  });

  it("pre-revenue with no market size is not applicable", () => {
    const r = vcMethod(plugSecure(), "pre_seed");
    expect(r.applicable).toBe(false);
    expect(r.valuationUsd).toBe(0);
  });

  it("weight hint grows with revenue: 0.5 at $0, 0.75 at $500k, 1.0 at $1M+", () => {
    expect(
      vcMethod(makeInput({ traction: { payingCustomers: 1, arrUsd: 500_000 } }), "seed").weightHint,
    ).toBe(0.75);
  });
});

describe("E. Revenue Multiples", () => {
  it("growth quality blends MoM and NRR 50/50 with sceptical defaults", () => {
    expect(growthQuality(15, 120)).toBe(1);
    expect(growthQuality(0, 90)).toBe(0);
    expect(growthQuality(7.5, 105)).toBe(0.5);
    expect(growthQuality(undefined, undefined)).toBeCloseTo(1 / 3, 6);
  });

  it("$500k ARR saas at top growth → 12× + non-recurring at 1×", () => {
    const input = makeInput({
      traction: {
        payingCustomers: 20,
        arrUsd: 500_000,
        nonRecurringRevenueTtmUsd: 100_000,
        momGrowthPct: 15,
        netRevenueRetentionPct: 120,
      },
    });
    const r = multiples(input);
    expect(r.valuationUsd).toBe(6_100_000);
    expect(r.weightHint).toBeCloseTo(0.1 + 0.35 * (400_000 / 900_000), 4);
    expect(r.applicable).toBe(true);
  });

  it("haircuts for low gross margin (−20%) and high churn (−25%)", () => {
    const input = makeInput({
      traction: {
        payingCustomers: 20,
        arrUsd: 1e6,
        momGrowthPct: 15,
        netRevenueRetentionPct: 120,
        grossMarginPct: 40,
        churnAnnualPct: 25,
      },
    });
    const r = multiples(input);
    expect(r.inputsUsed.multiple).toBeCloseTo(12 * 0.8 * 0.75, 3);
    expect(r.valuationUsd).toBe(7_200_000);
    expect(r.weightHint).toBe(0.45);
  });

  it("not applicable below $100k ARR", () => {
    const r = multiples(makeInput({ traction: { payingCustomers: 2, arrUsd: 50_000 } }));
    expect(r.applicable).toBe(false);
    expect(r.valuationUsd).toBe(0);
  });
});

describe("F. Last-Round Anchor", () => {
  it("annual step-up: 0.25 + 0.5 × (traction − 50) / 50, floored at 0 unless distressed", () => {
    expect(annualStepUp(50, false)).toBe(0.25);
    expect(annualStepUp(100, false)).toBe(0.75);
    expect(annualStepUp(10, false)).toBe(0);
    expect(annualStepUp(10, true)).toBeCloseTo(-0.15, 6);
    expect(annualStepUp(0, true)).toBeCloseTo(-0.25, 6);
  });

  it("PlugSecure: $2.62M post stepped up 29%/yr since 2025-04-01", () => {
    const input = plugSecure();
    const scores = scoreFromInputs(input);
    const r = anchor(input, scores, AS_OF);
    const months = (AS_OF.getTime() - Date.parse("2025-04-01")) / (86_400_000 * 30.4375);
    expect(r.applicable).toBe(true);
    expect(r.inputsUsed.annualStepUp).toBeCloseTo(0.29, 4);
    expect(r.valuationUsd).toBeCloseTo(2_620_000 * 1.29 ** (months / 12), -1);
    expect(r.weightHint).toBe(0.2); // 17.5 months → ≤ 24
    expect(r.notes[0]).toContain("pre-seed round of $720k at $2.62M post-money, dated 2025-04-01");
  });

  it("on the round date the anchor equals the post-money", () => {
    const input = plugSecure();
    const r = anchor(input, scoreFromInputs(input), new Date("2025-04-01T00:00:00Z"));
    expect(r.valuationUsd).toBe(2_620_000);
    expect(r.weightHint).toBe(0.35);
  });

  it("weight hint by age: 0.35 ≤ 12m, 0.20 ≤ 24m, 0.10 after, not applicable > 36m", () => {
    const input = plugSecure();
    const scores = scoreFromInputs(input);
    expect(anchor(input, scores, new Date("2026-03-01")).weightHint).toBe(0.35);
    expect(anchor(input, scores, new Date("2027-06-01")).weightHint).toBe(0.1);
    const old = anchor(input, scores, new Date("2028-06-01"));
    expect(old.applicable).toBe(false);
    expect(old.valuationUsd).toBe(0);
  });

  it("a distressed company can be marked down (up to −30%/yr)", () => {
    const input = makeInput({
      financials: { monthlyBurnUsd: 10_000, cashOnHandUsd: 20_000 }, // 2 months runway
      funding: {
        rounds: [{ type: "seed", date: "2025-09-18", amountUsd: 1e6, postMoneyUsd: 5e6 }],
      },
    });
    const scores = { ...NEUTRAL, traction: 10 }; // raw −0.15
    const r = anchor(input, scores, AS_OF);
    expect(r.inputsUsed.distressed).toBe(true);
    expect(r.inputsUsed.annualStepUp).toBeCloseTo(-0.15, 4);
    expect(r.valuationUsd).toBeLessThan(5e6);
  });

  it("no priced round → not applicable", () => {
    const r = anchor(makeInput(), NEUTRAL, AS_OF);
    expect(r.applicable).toBe(false);
    expect(r.notes[0]).toContain("No priced round");
  });
});

describe("G. Market-size cross-check", () => {
  it("ceiling = SOM × 3 and reports whether it binds", () => {
    const input = makeInput({ market: { tamUsd: 1e9, samUsd: 100e6, somUsd: 1e6 } });
    const binding = marketCheck(input, 5e6);
    expect(binding.ceilingUsd).toBe(3e6);
    expect(binding.applied).toBe(true);
    expect(binding.missing).toBe(false);
    const loose = marketCheck(input, 2e6);
    expect(loose.applied).toBe(false);
  });

  it("without SOM there is no ceiling and the market is flagged missing", () => {
    const r = marketCheck(plugSecure(), 5e6);
    expect(r.ceilingUsd).toBeUndefined();
    expect(r.applied).toBe(false);
    expect(r.missing).toBe(true);
  });

  it("stage detection and market check agree on PlugSecure being pre-revenue", () => {
    expect(detectStage(plugSecure()).stage).toBe("pre_seed");
  });
});
