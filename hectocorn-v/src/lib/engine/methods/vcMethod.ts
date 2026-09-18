import {
  DEFAULT_ANNUAL_GROWTH_BY_STAGE,
  DILUTION_TO_EXIT_BY_STAGE,
  MAX_ANNUAL_GROWTH,
  SECTOR_EXIT_MULTIPLE_AT_SCALE,
  TARGET_ROI_BY_STAGE,
  YEARS_TO_EXIT_BY_STAGE,
  type Sector,
  type Stage,
} from "../benchmarks";
import { clamp, round } from "../helpers";
import type { MethodResult } from "../types";
import { fmt } from "./scorecard";
import type { StartupInput } from "@/lib/schema/startup";

export const VC_REVENUE_PATH_MIN_USD = 50_000;
export const SOM_CAPTURE_SHARE = 0.1;
export const TAM_CAPTURE_SHARE = 0.005;

/** Annualised growth from month-over-month growth, capped. */
export function annualGrowthFromMom(momGrowthPct: number): number {
  const g = (1 + momGrowthPct / 100) ** 12 - 1;
  return clamp(g, -0.9, MAX_ANNUAL_GROWTH);
}

export function vcMethod(input: StartupInput, stage: Stage): MethodResult {
  const arr = input.traction.arrUsd;
  const nonRecurring = input.traction.nonRecurringRevenueTtmUsd;
  const revenueBase = Math.max(arr, nonRecurring * 0.5, 1);
  const years = YEARS_TO_EXIT_BY_STAGE[stage];
  const targetRoi = TARGET_ROI_BY_STAGE[stage];
  const dilution = DILUTION_TO_EXIT_BY_STAGE[stage];
  const exitMultiple = SECTOR_EXIT_MULTIPLE_AT_SCALE[input.sector as Sector];
  const { somUsd, tamUsd } = input.market;
  const notes: string[] = [];
  const inputsUsed: MethodResult["inputsUsed"] = {
    stage,
    revenueBaseUsd: round(revenueBase),
    yearsToExit: years,
    targetRoi,
    dilutionToExit: dilution,
    exitMultiple,
  };

  let revenueAtExit: number;
  if (revenueBase >= VC_REVENUE_PATH_MIN_USD) {
    const g =
      input.traction.momGrowthPct !== undefined
        ? annualGrowthFromMom(input.traction.momGrowthPct)
        : DEFAULT_ANNUAL_GROWTH_BY_STAGE[stage];
    revenueAtExit = revenueBase * (1 + g) ** years;
    inputsUsed.annualGrowth = round(g, 4);
    inputsUsed.path = "revenue";
    notes.push(
      `Revenue path: ${fmt(revenueBase)} today growing ${Math.round(g * 100)}%/yr${
        input.traction.momGrowthPct !== undefined
          ? ` (from ${input.traction.momGrowthPct}% MoM, capped at ${MAX_ANNUAL_GROWTH * 100}%)`
          : " (stage default)"
      } for ${years} years → ${fmt(revenueAtExit)} at exit.`,
    );
  } else {
    if (somUsd === undefined && tamUsd === undefined) {
      return {
        key: "vc",
        name: "VC Method",
        valuationUsd: 0,
        applicable: false,
        weightHint: 0,
        inputsUsed: { ...inputsUsed, path: "market", somUsd: null, tamUsd: null },
        notes: [
          "Pre-revenue and no TAM/SOM supplied: the market-based path needs a market size estimate.",
        ],
      };
    }
    const candidates: number[] = [];
    if (somUsd !== undefined) candidates.push(somUsd * SOM_CAPTURE_SHARE);
    if (tamUsd !== undefined) candidates.push(tamUsd * TAM_CAPTURE_SHARE);
    revenueAtExit = Math.min(...candidates);
    inputsUsed.path = "market";
    inputsUsed.somUsd = somUsd ?? null;
    inputsUsed.tamUsd = tamUsd ?? null;
    notes.push(
      `Pre-revenue path: revenue at exit = min(SOM × ${SOM_CAPTURE_SHARE * 100}%, TAM × ${TAM_CAPTURE_SHARE * 100}%) = ${fmt(revenueAtExit)}${input.market.hasEstimateFromAi ? " (market size estimated by AI)" : ""}.`,
    );
  }

  const exitValue = revenueAtExit * exitMultiple;
  const postMoneyToday = (exitValue / targetRoi) * (1 - dilution);
  let preMoney = postMoneyToday;
  const raise = input.funding.currentlyRaising ? (input.funding.targetRaiseUsd ?? 0) : 0;
  if (raise > 0) {
    const floor = postMoneyToday * 0.1;
    preMoney = Math.max(postMoneyToday - raise, floor);
    if (postMoneyToday - raise < floor) {
      notes.push(
        `The target raise (${fmt(raise)}) exceeds what this method supports at the required return; pre-money floored at 10% of the implied post-money.`,
      );
    }
  }

  inputsUsed.revenueAtExitUsd = round(revenueAtExit);
  inputsUsed.exitValueUsd = round(exitValue);
  inputsUsed.postMoneyTodayUsd = round(postMoneyToday);
  inputsUsed.targetRaiseUsd = raise;
  notes.push(
    `Exit value ${fmt(revenueAtExit)} × ${exitMultiple}× = ${fmt(exitValue)}; ÷ target ${targetRoi}× return × (1 − ${Math.round(dilution * 100)}% dilution) = ${fmt(postMoneyToday)} post-money today${raise > 0 ? `; less ${fmt(raise)} raise = ${fmt(preMoney)} pre-money` : ""}.`,
  );

  const weightHint = 0.5 + 0.5 * clamp(revenueBase / 1e6, 0, 1);
  return {
    key: "vc",
    name: "VC Method",
    valuationUsd: round(preMoney),
    applicable: true,
    weightHint: round(weightHint, 4),
    inputsUsed,
    notes,
  };
}
