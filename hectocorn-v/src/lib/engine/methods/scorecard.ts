import { REGION_FACTOR, STAGE_MEDIAN_PRE_MONEY_USD, type Region, type Stage } from "../benchmarks";
import { round } from "../helpers";
import type { MethodResult, Scores } from "../types";
import type { StartupInput } from "@/lib/schema/startup";

/** Scorecard (Payne) factor weights. */
export const SCORECARD_WEIGHTS = {
  team: 0.3,
  market: 0.25,
  product: 0.15,
  traction: 0.1,
  moat: 0.1,
  deal: 0.1,
} as const;

/** Factor multiplier: 0 → 0.5×, 50 → 1.0×, 100 → 1.5×. */
export const scorecardMultiplier = (score: number) => 0.5 + score / 100;

export function scorecard(input: StartupInput, stage: Stage, scores: Scores): MethodResult {
  const base = STAGE_MEDIAN_PRE_MONEY_USD[stage] * REGION_FACTOR[input.hqRegion as Region];
  const applicable = stage === "idea" || stage === "pre_seed" || stage === "seed";

  let sum = 0;
  const inputsUsed: MethodResult["inputsUsed"] = {
    stage,
    stageMedianUsd: STAGE_MEDIAN_PRE_MONEY_USD[stage],
    region: input.hqRegion,
    regionFactor: REGION_FACTOR[input.hqRegion as Region],
    baseUsd: round(base),
  };
  const notes: string[] = [];
  for (const [factor, weight] of Object.entries(SCORECARD_WEIGHTS) as [
    keyof typeof SCORECARD_WEIGHTS,
    number,
  ][]) {
    const score = scores[factor];
    const m = scorecardMultiplier(score);
    sum += weight * m;
    inputsUsed[`${factor}Score`] = score;
    notes.push(
      `${factor}: score ${score} → ${m.toFixed(2)}× at ${Math.round(weight * 100)}% weight`,
    );
  }
  const valuation = base * sum;
  inputsUsed.weightedMultiplier = round(sum, 4);
  notes.unshift(
    `Base = stage median ${fmt(STAGE_MEDIAN_PRE_MONEY_USD[stage])} × region factor ${REGION_FACTOR[input.hqRegion as Region]} = ${fmt(base)}; weighted multiplier ${sum.toFixed(3)}×.`,
  );
  if (!applicable) notes.push("Not applicable beyond seed stage.");

  return {
    key: "scorecard",
    name: "Scorecard",
    valuationUsd: applicable ? round(valuation) : 0,
    applicable,
    weightHint: 1,
    inputsUsed,
    notes,
  };
}

export function fmt(v: number): string {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${Math.round(v)}`;
}
