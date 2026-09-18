import { describe, expect, it } from "vitest";
import { runEngine, toUsd, runSensitivity, applyWhatIf } from "@/lib/engine";
import { PLUGSECURE_EXAMPLE, plugSecure } from "@/lib/schema/examples";
import { StartupInput, schemaDescriptions } from "@/lib/schema/startup";
import { AS_OF, makeInput } from "./fixtures";

describe("PlugSecure fixture (§7)", () => {
  it("produces a pre-money between $3.0M and $6.5M without exceptions", () => {
    const r = runEngine(plugSecure(), { asOf: AS_OF });
    expect(r.preMoneyUsd).toBeGreaterThanOrEqual(3.0e6);
    expect(r.preMoneyUsd).toBeLessThanOrEqual(6.5e6);
  });

  it("also within band at the current date", () => {
    const r = runEngine(plugSecure());
    expect(r.preMoneyUsd).toBeGreaterThanOrEqual(3.0e6);
    expect(r.preMoneyUsd).toBeLessThanOrEqual(6.5e6);
  });

  it("matches the hand-computed blend of Scorecard, Berkus, RFS and Anchor", () => {
    const r = runEngine(plugSecure(), { asOf: AS_OF });
    expect(r.stage).toBe("pre_seed");
    const byKey = Object.fromEntries(r.methods.map((m) => [m.key, m]));
    expect(byKey.scorecard.applicable).toBe(true);
    expect(byKey.berkus.applicable).toBe(true);
    expect(byKey.rfs.applicable).toBe(true);
    expect(byKey.anchor.applicable).toBe(true);
    expect(byKey.vc.applicable).toBe(false); // pre-revenue, no market size yet
    expect(byKey.multiples.applicable).toBe(false);
    // weights 30 / 20 / 20 / (10 × 0.2 = 2) over 72
    expect(r.weights.scorecard).toBeCloseTo(30 / 72, 3);
    expect(r.weights.anchor).toBeCloseTo(2 / 72, 3);
    const expected = Math.exp(
      (30 / 72) * Math.log(byKey.scorecard.valuationUsd) +
        (20 / 72) * Math.log(byKey.berkus.valuationUsd) +
        (20 / 72) * Math.log(byKey.rfs.valuationUsd) +
        (2 / 72) * Math.log(byKey.anchor.valuationUsd),
    );
    expect(r.preMoneyUsd).toBeCloseTo(expected, -1);
    expect(r.preMoneyUsd).toBeCloseTo(3_136_000, -5); // ≈ $3.14M
  });

  it("reports the implied post-money, confidence, flags and benchmark version", () => {
    const r = runEngine(plugSecure(), { asOf: AS_OF });
    expect(r.impliedPostMoneyUsd).toBe(r.preMoneyUsd + 1_500_000);
    expect(r.confidence).toBeGreaterThan(50);
    expect(r.lowUsd).toBe(Math.round(r.preMoneyUsd * 0.7));
    expect(r.highUsd).toBe(Math.round(r.preMoneyUsd * 1.4));
    expect(r.flags).toContain("missing_market_size");
    expect(r.benchmarksVersion).toMatch(/^\d{4}\.\d{2}$/);
    expect(r.scoresSource).toBe("deterministic");
    expect(r.runwayMonths).toBe(0);
  });

  it("is deterministic", () => {
    const a = runEngine(plugSecure(), { asOf: AS_OF });
    const b = runEngine(plugSecure(), { asOf: AS_OF });
    expect(a).toEqual(b);
  });

  it("the raw example validates against the schema", () => {
    expect(StartupInput.safeParse(PLUGSECURE_EXAMPLE).success).toBe(true);
  });
});

describe("engine options", () => {
  it("uses AI scores when provided and keeps the deterministic ones", () => {
    const input = plugSecure();
    const ai = {
      team: 85,
      market: 80,
      product: 75,
      traction: 60,
      moat: 90,
      financial: 35,
      deal: 75,
    };
    const r = runEngine(input, { asOf: AS_OF, scores: ai, scoresSource: "ai" });
    expect(r.scoresSource).toBe("ai");
    expect(r.scores).toEqual(ai);
    expect(r.aiScores).toEqual(ai);
    expect(r.deterministicScores.team).toBe(73);
    expect(r.preMoneyUsd).toBeGreaterThan(runEngine(input, { asOf: AS_OF }).preMoneyUsd);
  });

  it("applies the market ceiling (SOM × 3) and flags it", () => {
    const input = plugSecure();
    input.market = { ...input.market, tamUsd: 2e9, samUsd: 200e6, somUsd: 500_000 };
    const r = runEngine(input, { asOf: AS_OF });
    expect(r.marketCeilingUsd).toBe(1_500_000);
    expect(r.preMoneyUsd).toBe(1_500_000);
    expect(r.flags).toContain("market_ceiling_applied");
    expect(r.blendedUsd).toBeGreaterThan(1_500_000);
    expect(r.flags).not.toContain("missing_market_size");
  });

  it("flags when the market size came from the AI estimator", () => {
    const input = plugSecure();
    input.market = {
      ...input.market,
      tamUsd: 5e9,
      samUsd: 500e6,
      somUsd: 100e6,
      hasEstimateFromAi: true,
    };
    const r = runEngine(input, { asOf: AS_OF });
    expect(r.flags).toContain("market_size_estimated_by_ai");
    expect(r.methods.find((m) => m.key === "vc")?.applicable).toBe(true);
  });

  it("every stage produces a positive number for a plausible company", () => {
    const seriesA = makeInput({
      traction: { payingCustomers: 40, arrUsd: 2e6, momGrowthPct: 8, netRevenueRetentionPct: 110 },
      funding: {
        rounds: [{ type: "series_a", date: "2026-01-01", amountUsd: 8e6, postMoneyUsd: 40e6 }],
      },
    });
    const r = runEngine(seriesA, { asOf: AS_OF });
    expect(r.stage).toBe("series_a");
    expect(r.preMoneyUsd).toBeGreaterThan(5e6);
    expect(Object.values(r.weights).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 3);
    const idea = runEngine(makeInput(), { asOf: AS_OF });
    expect(idea.stage).toBe("idea");
    expect(idea.preMoneyUsd).toBeGreaterThan(0);
  });
});

describe("currency conversion", () => {
  it("converts every *Usd amount from EUR at 1.08, including nested rounds", () => {
    const eur = makeInput({
      reportingCurrency: "EUR",
      traction: { payingCustomers: 1, arrUsd: 100 },
      funding: {
        rounds: [{ type: "seed", date: "2025-01-01", amountUsd: 1000, postMoneyUsd: 5000 }],
      },
    });
    const usd = toUsd(eur);
    expect(usd.traction.arrUsd).toBeCloseTo(108, 9);
    expect(usd.funding.rounds[0].amountUsd).toBeCloseTo(1080, 9);
    expect(usd.funding.rounds[0].postMoneyUsd).toBeCloseTo(5400, 9);
    expect(usd.financials.cashOnHandUsd).toBeCloseTo(120_000 * 1.08, 6);
    expect(usd.reportingCurrency).toBe("USD");
    // the original is untouched
    expect(eur.traction.arrUsd).toBe(100);
    expect(eur.reportingCurrency).toBe("EUR");
  });

  it("GBP converts at 1.27 and USD is a no-op copy", () => {
    const gbp = makeInput({
      reportingCurrency: "GBP",
      traction: { payingCustomers: 1, arrUsd: 100 },
    });
    expect(toUsd(gbp).traction.arrUsd).toBeCloseTo(127, 9);
    const usd = makeInput();
    const copy = toUsd(usd);
    expect(copy).toEqual(usd);
    expect(copy).not.toBe(usd);
  });

  it("does not touch non-amount fields", () => {
    const eur = makeInput({
      reportingCurrency: "EUR",
      traction: { payingCustomers: 3, momGrowthPct: 10 },
    });
    const usd = toUsd(eur);
    expect(usd.traction.payingCustomers).toBe(3);
    expect(usd.traction.momGrowthPct).toBe(10);
    expect(usd.team.foundersWithDomainYears).toBe(5);
  });
});

describe("sensitivity", () => {
  it("returns the eight documented scenarios with deltas against the base", () => {
    const input = plugSecure();
    const base = runEngine(input, { asOf: AS_OF });
    const s = runSensitivity(input, base, { asOf: AS_OF });
    expect(s.map((x) => x.key)).toEqual([
      "arr_up_50",
      "arr_down_50",
      "customer_plus_1",
      "patent_plus_1",
      "country_plus_1",
      "mom_plus_5",
      "region_us",
      "runway_plus_12",
    ]);
    const byKey = Object.fromEntries(s.map((x) => [x.key, x]));
    expect(byKey.arr_up_50.noop).toBe(true); // ARR is 0
    expect(byKey.arr_up_50.deltaUsd).toBe(0);
    expect(byKey.customer_plus_1.deltaUsd).toBeGreaterThan(0);
    expect(byKey.region_us.deltaUsd).toBeGreaterThan(0);
    expect(byKey.runway_plus_12.deltaUsd).toBeGreaterThan(0);
    expect(byKey.region_us.deltaPct).toBeCloseTo(
      (byKey.region_us.deltaUsd / base.preMoneyUsd) * 100,
      0,
    );
  });

  it("applyWhatIf sets runway via cash and pads operating countries", () => {
    const input = plugSecure();
    const w = applyWhatIf(input, { runwayMonths: 18, operatingCountriesCount: 5, arrUsd: 250_000 });
    expect(w.financials.cashOnHandUsd).toBe(18); // burn is 0 → max(burn, 1)
    expect(w.operatingCountries).toHaveLength(5);
    expect(w.traction.arrUsd).toBe(250_000);
    expect(input.traction.arrUsd).toBe(0); // original untouched
  });

  it("a Series A company loses value when ARR halves and gains when it grows", () => {
    const input = makeInput({
      traction: { payingCustomers: 40, arrUsd: 2e6, momGrowthPct: 8 },
    });
    const base = runEngine(input, { asOf: AS_OF });
    const byKey = Object.fromEntries(
      runSensitivity(input, base, { asOf: AS_OF }).map((x) => [x.key, x]),
    );
    expect(byKey.arr_down_50.deltaUsd).toBeLessThan(0);
    expect(byKey.arr_up_50.deltaUsd).toBeGreaterThan(0);
  });
});

describe("schema", () => {
  it("exposes field descriptions for tooltips and prompts", () => {
    const d = schemaDescriptions();
    expect(d["traction.arrUsd"]).toBe("Annual recurring revenue");
    expect(d["ip.regulatoryTailwind"]).toContain("NIS2");
    expect(d["oneLiner"]).toBeDefined();
  });

  it("applies defaults and rejects bad input", () => {
    const parsed = StartupInput.parse(PLUGSECURE_EXAMPLE);
    expect(parsed.ip.patentsPending).toBe(0);
    expect(parsed.market.hasEstimateFromAi).toBe(false);
    expect(StartupInput.safeParse({ ...PLUGSECURE_EXAMPLE, hqCountry: "GRC" }).success).toBe(false);
    expect(StartupInput.safeParse({ ...PLUGSECURE_EXAMPLE, oneLiner: "short" }).success).toBe(
      false,
    );
  });
});
