import {
  BENCHMARKS_VERSION,
  RANGE_NORMAL,
  RANGE_WIDE,
  RANGE_WIDE_CONFIDENCE_THRESHOLD,
  REGION_FACTOR,
  STAGE_MEDIAN_PRE_MONEY_USD,
  type Region,
} from "./benchmarks";
import { blend } from "./blend";
import { round, runwayMonths } from "./helpers";
import { anchor } from "./methods/anchor";
import { berkus } from "./methods/berkus";
import { marketCheck } from "./methods/marketCheck";
import { multiples } from "./methods/multiples";
import { rfs } from "./methods/rfs";
import { scorecard } from "./methods/scorecard";
import { vcMethod } from "./methods/vcMethod";
import { scoreFromInputs } from "./scores";
import { detectStage } from "./stage";
import type { EngineOptions, EngineResult, MethodResult } from "./types";
import type { StartupInput } from "@/lib/schema/startup";

/**
 * Run the deterministic valuation engine. Pure: same input + options → same output.
 * Amounts must already be in USD (see `toUsd`).
 */
export function runEngine(input: StartupInput, options: EngineOptions = {}): EngineResult {
  const asOf = options.asOf ?? new Date();
  const detection = detectStage(input);
  const stage = detection.stage;
  const deterministicScores = scoreFromInputs(input);
  const scores = options.scores ?? deterministicScores;
  const scoresSource = options.scores ? (options.scoresSource ?? "ai") : "deterministic";

  const methods: MethodResult[] = [
    scorecard(input, stage, scores),
    berkus(input, scores),
    rfs(input, stage, scores),
    vcMethod(input, stage),
    multiples(input),
    anchor(input, scores, asOf),
  ];

  const blended = blend(methods, stage);
  const flags = [...blended.flags];
  if (detection.usedSelfDeclared) flags.push("stage_tiebreaker_self_declared");

  let preMoneyUsd = blended.blendedUsd;
  if (preMoneyUsd === 0) {
    // Nothing applicable (should not happen with a valid input): fall back to the stage median.
    preMoneyUsd = round(
      STAGE_MEDIAN_PRE_MONEY_USD[stage] * REGION_FACTOR[input.hqRegion as Region],
    );
    flags.push("fallback_stage_median");
  }

  const check = marketCheck(input, preMoneyUsd);
  if (check.missing) flags.push("missing_market_size");
  if (check.applied && check.ceilingUsd !== undefined) {
    preMoneyUsd = check.ceilingUsd;
    flags.push("market_ceiling_applied");
  }
  if (input.market.hasEstimateFromAi) flags.push("market_size_estimated_by_ai");

  const range = blended.confidence < RANGE_WIDE_CONFIDENCE_THRESHOLD ? RANGE_WIDE : RANGE_NORMAL;
  const lowUsd = round(preMoneyUsd * range.low);
  const highUsd = round(preMoneyUsd * range.high);

  const raise = input.funding.currentlyRaising ? input.funding.targetRaiseUsd : undefined;
  const impliedPostMoneyUsd =
    raise !== undefined && raise > 0 ? round(preMoneyUsd + raise) : undefined;

  return {
    stage,
    stageReason: detection.reason,
    scores,
    deterministicScores,
    aiScores: options.scores && scoresSource === "ai" ? options.scores : undefined,
    scoresSource,
    methods,
    weights: Object.fromEntries(Object.entries(blended.weights).map(([k, v]) => [k, round(v, 4)])),
    blendedUsd: blended.blendedUsd,
    preMoneyUsd,
    lowUsd,
    highUsd,
    impliedPostMoneyUsd,
    confidence: blended.confidence,
    flags: Array.from(new Set(flags)),
    marketCeilingUsd: check.ceilingUsd,
    runwayMonths: round(runwayMonths(input), 1),
    benchmarksVersion: BENCHMARKS_VERSION,
    asOf: asOf.toISOString(),
  };
}
