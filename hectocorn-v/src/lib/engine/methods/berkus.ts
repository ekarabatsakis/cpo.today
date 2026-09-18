import { BERKUS_CAP_PER_FACTOR_USD, REGION_FACTOR, type Region } from "../benchmarks";
import { round } from "../helpers";
import type { MethodResult, Scores } from "../types";
import { fmt } from "./scorecard";
import type { StartupInput } from "@/lib/schema/startup";

/** Berkus factors and the score each one draws from. */
export const BERKUS_FACTORS = [
  { label: "Sound idea (market)", score: "market" },
  { label: "Prototype (product)", score: "product" },
  { label: "Quality team", score: "team" },
  { label: "Strategic relationships (deal)", score: "deal" },
  { label: "Product rollout / sales (traction)", score: "traction" },
] as const;

export const BERKUS_ARR_LIMIT_USD = 250_000;

export function berkus(input: StartupInput, scores: Scores): MethodResult {
  const arr = input.traction.arrUsd;
  const applicable = arr < BERKUS_ARR_LIMIT_USD;
  const regionFactor = REGION_FACTOR[input.hqRegion as Region];

  let sum = 0;
  const notes: string[] = [];
  const inputsUsed: MethodResult["inputsUsed"] = {
    arrUsd: arr,
    capPerFactorUsd: BERKUS_CAP_PER_FACTOR_USD,
    regionFactor,
  };
  for (const f of BERKUS_FACTORS) {
    const score = scores[f.score];
    const value = (score / 100) * BERKUS_CAP_PER_FACTOR_USD;
    sum += value;
    inputsUsed[`${f.score}Score`] = score;
    notes.push(`${f.label}: ${score}/100 → ${fmt(value)}`);
  }
  const valuation = sum * regionFactor;
  notes.push(`Sum ${fmt(sum)} × region factor ${regionFactor} = ${fmt(valuation)}.`);
  if (!applicable) notes.push(`Not applicable: ARR ≥ ${fmt(BERKUS_ARR_LIMIT_USD)}.`);
  else if (arr > 0) notes.push("Weight reduced: the company already has recurring revenue.");

  return {
    key: "berkus",
    name: "Berkus",
    valuationUsd: applicable ? round(valuation) : 0,
    applicable,
    weightHint: applicable ? (arr > 0 ? 0.5 : 1) : 0,
    inputsUsed,
    notes,
  };
}
