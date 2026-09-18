import { describe, expect, it } from "vitest";
import { marketScoreFromTam, scoreFromInputs } from "@/lib/engine/scores";
import { plugSecure } from "@/lib/schema/examples";
import { makeInput } from "./fixtures";

describe("deterministic scores", () => {
  it("baseline input lands on the documented neutral values", () => {
    expect(scoreFromInputs(makeInput())).toEqual({
      team: 60, // 40 + 10 technical + 2×5 domain years
      market: 50, // no TAM → neutral
      product: 55, // mvp
      traction: 10, // no customers
      moat: 50, // medium defensibility
      financial: 50, // 12 months runway
      deal: 50,
    });
  });

  it("team: PlugSecure = 40 + 10 + 15 + 20 + 3 − 15 = 73", () => {
    expect(scoreFromInputs(plugSecure()).team).toBe(73);
  });

  it("team is clamped at 100", () => {
    const input = makeInput({
      team: {
        fullTimeEmployees: 5,
        founders: 3,
        foundersWithPriorExit: 3,
        foundersWithDomainYears: 30,
        technicalCofounder: true,
        advisorsNotable: 5,
      },
    });
    expect(scoreFromInputs(input).team).toBe(100);
  });

  it("market score buckets by TAM", () => {
    expect(marketScoreFromTam(undefined)).toBe(50);
    expect(marketScoreFromTam(400e6)).toBe(30);
    expect(marketScoreFromTam(1e9)).toBe(50);
    expect(marketScoreFromTam(5e9)).toBe(70);
    expect(marketScoreFromTam(20e9)).toBe(85);
  });

  it("market: CAGR, regulatory tailwind and competition adjust and clamp", () => {
    const big = makeInput({
      market: { tamUsd: 20e9, marketCagrPct: 20 },
      ip: { productStage: "mvp", techDefensibility: "medium", regulatoryTailwind: true },
    });
    expect(scoreFromInputs(big).market).toBe(100); // 85 + 10 + 10 = 105 → 100
    const crowded = makeInput({ market: { tamUsd: 400e6, competitiveIntensity: "high" } });
    expect(scoreFromInputs(crowded).market).toBe(20);
    expect(scoreFromInputs(plugSecure()).market).toBe(60); // neutral 50 + tailwind
  });

  it("product: stage value plus 5 per certification, capped at +15", () => {
    const input = makeInput({
      ip: {
        productStage: "launched",
        techDefensibility: "medium",
        certifications: ["ISO 27001", "SOC2", "IEC 62443", "CE"],
      },
    });
    expect(scoreFromInputs(input).product).toBe(90);
    expect(scoreFromInputs(plugSecure()).product).toBe(75);
  });

  it("traction: 3 customers → 54; 1 customer → 38; everything → clamped 100", () => {
    expect(scoreFromInputs(plugSecure()).traction).toBe(54);
    expect(scoreFromInputs(makeInput({ traction: { payingCustomers: 1 } })).traction).toBe(38);
    const full = makeInput({
      traction: {
        payingCustomers: 8,
        arrUsd: 100_000,
        momGrowthPct: 12,
        marqueeCustomers: ["A", "B", "C"],
        netRevenueRetentionPct: 110,
      },
    });
    // 30 + 40 + 12 + 15 + 10 + 10 + 5 = 122 → 100
    expect(scoreFromInputs(full).traction).toBe(100);
  });

  it("moat: PlugSecure = 75 + 10 + 10 + 5 = 100; weak hardware = 15", () => {
    expect(scoreFromInputs(plugSecure()).moat).toBe(100);
    const weak = makeInput({
      ip: { productStage: "mvp", techDefensibility: "low" },
      risks: { hardwareSupplyRisk: true },
    });
    expect(scoreFromInputs(weak).moat).toBe(15);
  });

  it("financial: runway, margin, profitability and churn", () => {
    expect(
      scoreFromInputs(makeInput({ financials: { monthlyBurnUsd: 10_000, cashOnHandUsd: 240_000 } }))
        .financial,
    ).toBe(60);
    expect(
      scoreFromInputs(makeInput({ financials: { monthlyBurnUsd: 10_000, cashOnHandUsd: 30_000 } }))
        .financial,
    ).toBe(35);
    const mixed = makeInput({
      traction: { payingCustomers: 0, grossMarginPct: 80, churnAnnualPct: 20 },
      financials: { monthlyBurnUsd: 10_000, cashOnHandUsd: 120_000, isProfitable: true },
    });
    expect(scoreFromInputs(mixed).financial).toBe(55); // 50 + 10 + 10 − 15
    expect(scoreFromInputs(plugSecure()).financial).toBe(35); // zero cash → runway 0
  });

  it("deal: PlugSecure = 50 + 15 VC + 10 raised = 75; partnerships and concentration", () => {
    expect(scoreFromInputs(plugSecure()).deal).toBe(75);
    expect(
      scoreFromInputs(
        makeInput({ traction: { payingCustomers: 0, partnerships: ["a", "b", "c", "d"] } }),
      ).deal,
    ).toBe(65);
    expect(scoreFromInputs(makeInput({ risks: { singleCustomerConcentrationPct: 60 } })).deal).toBe(
      40,
    );
  });
});
