import { SECTOR_ARR_MULTIPLE, type Sector } from "../benchmarks";
import { clamp, lerp, round } from "../helpers";
import type { MethodResult } from "../types";
import { fmt } from "./scorecard";
import type { StartupInput } from "@/lib/schema/startup";

export const MULTIPLES_MIN_ARR_USD = 100_000;

/** Growth quality 0–1 from MoM growth (0% → 0, ≥ 15% → 1) and NRR (≤ 90 → 0, ≥ 120 → 1), 50/50. */
export function growthQuality(
  momGrowthPct: number | undefined,
  nrrPct: number | undefined,
): number {
  // When not supplied, assume 5% MoM and 100% NRR (a sceptical middle).
  const mom = momGrowthPct ?? 5;
  const nrr = nrrPct ?? 100;
  const momQ = clamp(mom / 15, 0, 1);
  const nrrQ = clamp((nrr - 90) / 30, 0, 1);
  return 0.5 * momQ + 0.5 * nrrQ;
}

export function multiples(input: StartupInput): MethodResult {
  const { arrUsd: arr, nonRecurringRevenueTtmUsd: nonRecurring } = input.traction;
  const applicable = arr >= MULTIPLES_MIN_ARR_USD;
  const [low, high] = SECTOR_ARR_MULTIPLE[input.sector as Sector];
  const gq = growthQuality(input.traction.momGrowthPct, input.traction.netRevenueRetentionPct);
  let multiple = lerp(low, high, gq);
  const notes: string[] = [];
  const adjustments: string[] = [];
  if (input.traction.grossMarginPct !== undefined && input.traction.grossMarginPct < 50) {
    multiple *= 0.8;
    adjustments.push("−20% for gross margin below 50%");
  }
  if ((input.traction.churnAnnualPct ?? 0) > 20) {
    multiple *= 0.75;
    adjustments.push("−25% for annual churn above 20%");
  }
  const valuation = arr * multiple + nonRecurring * 1.0;
  const weightHint = 0.1 + 0.35 * clamp((arr - MULTIPLES_MIN_ARR_USD) / 900_000, 0, 1);

  notes.push(
    `Sector EV/ARR band ${low}×–${high}×; growth quality ${gq.toFixed(2)} (from ${
      input.traction.momGrowthPct ?? "assumed 5"
    }% MoM and ${input.traction.netRevenueRetentionPct ?? "assumed 100"}% NRR) → ${multiple.toFixed(2)}×${
      adjustments.length ? ` after ${adjustments.join(", ")}` : ""
    }.`,
    `ARR ${fmt(arr)} × ${multiple.toFixed(2)} + non-recurring ${fmt(nonRecurring)} × 1.0 = ${fmt(valuation)}.`,
  );
  if (!applicable) notes.push(`Not applicable: ARR below ${fmt(MULTIPLES_MIN_ARR_USD)}.`);

  return {
    key: "multiples",
    name: "Revenue Multiples",
    valuationUsd: applicable ? round(valuation) : 0,
    applicable,
    weightHint: applicable ? round(weightHint, 4) : 0,
    inputsUsed: {
      arrUsd: arr,
      nonRecurringTtmUsd: nonRecurring,
      sector: input.sector,
      multipleLow: low,
      multipleHigh: high,
      growthQuality: round(gq, 3),
      multiple: round(multiple, 3),
      grossMarginPct: input.traction.grossMarginPct ?? null,
      churnAnnualPct: input.traction.churnAnnualPct ?? null,
    },
    notes,
  };
}
