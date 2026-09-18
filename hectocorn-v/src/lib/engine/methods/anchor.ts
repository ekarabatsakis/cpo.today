import {
  clamp,
  lastPricedRound,
  monthsBetween,
  parseIsoDate,
  round,
  runwayMonths,
} from "../helpers";
import type { MethodResult, Scores } from "../types";
import { fmt } from "./scorecard";
import type { StartupInput } from "@/lib/schema/startup";

export const ANCHOR_MAX_AGE_MONTHS = 36;

/** Annual step-up from the traction score: 0.25 + 0.5 × (traction − 50) / 50. */
export function annualStepUp(tractionScore: number, distressed: boolean): number {
  const raw = 0.25 + (0.5 * (tractionScore - 50)) / 50;
  // Normally a round is never marked down; a distressed company (runway < 6m,
  // no growth) may be marked down by up to 30% a year.
  return clamp(raw, distressed ? -0.3 : 0, 0.75);
}

export function anchor(input: StartupInput, scores: Scores, asOf: Date): MethodResult {
  const round_ = lastPricedRound(input);
  const notApplicable = (notes: string[]): MethodResult => ({
    key: "anchor",
    name: "Last-Round Anchor",
    valuationUsd: 0,
    applicable: false,
    weightHint: 0,
    inputsUsed: {},
    notes,
  });
  if (!round_ || round_.postMoneyUsd === undefined) {
    return notApplicable(["No priced round to anchor on."]);
  }
  const date = parseIsoDate(round_.date);
  if (!date) return notApplicable([`Round date "${round_.date}" is not a valid ISO date.`]);

  const months = Math.max(0, monthsBetween(date, asOf));
  const years = months / 12;
  const runway = runwayMonths(input);
  const noGrowth = !((input.traction.momGrowthPct ?? 0) > 0);
  const distressed = runway < 6 && noGrowth;
  const annual = annualStepUp(scores.traction, distressed);
  const stepUp = (1 + annual) ** years;
  const valuation = round_.postMoneyUsd * stepUp;
  const applicable = months <= ANCHOR_MAX_AGE_MONTHS;
  const weightHint = months <= 12 ? 0.35 : months <= 24 ? 0.2 : 0.1;

  const notes = [
    `Anchored on the ${round_.type.replace("_", "-")} round of ${fmt(round_.amountUsd)} at ${fmt(round_.postMoneyUsd)} post-money, dated ${round_.date} (${months.toFixed(1)} months ago${
      round_.leadInvestorType ? `, led by ${round_.leadInvestorType}` : ""
    }).`,
    `Annual step-up ${Math.round(annual * 100)}% from traction score ${scores.traction}${
      distressed ? " (distressed: runway < 6 months and no growth, mark-down allowed)" : ""
    }; ${fmt(round_.postMoneyUsd)} × ${stepUp.toFixed(3)} = ${fmt(valuation)}.`,
  ];
  if (!applicable)
    notes.push(`Not applicable: the round is older than ${ANCHOR_MAX_AGE_MONTHS} months.`);

  return {
    key: "anchor",
    name: "Last-Round Anchor",
    valuationUsd: applicable ? round(valuation) : 0,
    applicable,
    weightHint: applicable ? weightHint : 0,
    inputsUsed: {
      roundType: round_.type,
      roundDate: round_.date,
      roundAmountUsd: round_.amountUsd,
      postMoneyUsd: round_.postMoneyUsd,
      monthsSince: round(months, 1),
      tractionScore: scores.traction,
      annualStepUp: round(annual, 4),
      stepUp: round(stepUp, 4),
      distressed,
    },
    notes,
  };
}
