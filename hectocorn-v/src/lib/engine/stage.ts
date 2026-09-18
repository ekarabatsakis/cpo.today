import { STAGES, type Stage } from "./benchmarks";
import { lastPricedRound, totalRaisedUsd } from "./helpers";
import type { StartupInput } from "@/lib/schema/startup";

export interface StageDetection {
  stage: Stage;
  reason: string;
  /** True when the self-declared stage was used to break a tie. */
  usedSelfDeclared: boolean;
}

const PRODUCT_ORDER = { concept: 0, prototype: 1, mvp: 2, launched: 3, scaling: 4 } as const;

/**
 * Infer the stage from the data (first matching rule). The self-declared stage
 * is only a tiebreaker: it can lift the result by one stage when there is
 * partial evidence for it, never lower it below what the data established.
 */
export function detectStage(input: StartupInput): StageDetection {
  const arr = input.traction.arrUsd;
  const paying = input.traction.payingCustomers;
  const raised = totalRaisedUsd(input);
  const priced = lastPricedRound(input);
  const productIdx = PRODUCT_ORDER[input.ip.productStage];

  let stage: Stage;
  let reason: string;

  if (arr >= 5e6 || priced?.type === "series_b") {
    stage = "series_b_plus";
    reason = arr >= 5e6 ? "ARR ≥ $5M" : "last priced round was Series B or later";
  } else if (arr >= 1e6 || priced?.type === "series_a") {
    stage = "series_a";
    reason = arr >= 1e6 ? "ARR ≥ $1M" : "last priced round was a Series A";
  } else if (
    arr >= 150_000 ||
    paying >= 5 ||
    (priced?.type === "seed" && (priced.postMoneyUsd ?? 0) >= 4e6)
  ) {
    stage = "seed";
    reason =
      arr >= 150_000
        ? "ARR ≥ $150k"
        : paying >= 5
          ? "5 or more paying customers"
          : "last priced round was a Seed at ≥ $4M post-money";
  } else if (productIdx >= PRODUCT_ORDER.mvp && (paying >= 1 || raised >= 100_000)) {
    stage = "pre_seed";
    reason = `product is at ${input.ip.productStage} stage and ${
      paying >= 1 ? "has paying customers" : "has raised ≥ $100k"
    }`;
  } else {
    stage = "idea";
    reason = "no MVP with paying customers or ≥ $100k raised yet";
  }

  // Tiebreaker: self-declared stage one step above with partial evidence.
  const declared = input.selfDeclaredStage;
  if (declared && STAGES.indexOf(declared) === STAGES.indexOf(stage) + 1) {
    const evidence: Record<Stage, boolean> = {
      idea: true,
      pre_seed:
        productIdx >= PRODUCT_ORDER.prototype || raised > 0 || input.traction.pilotsOrLOIs > 0,
      seed: paying >= 3 || raised >= 1e6 || arr >= 75_000,
      series_a: arr >= 500_000 || raised >= 3e6,
      series_b_plus: arr >= 2.5e6 || raised >= 10e6,
    };
    if (evidence[declared]) {
      return {
        stage: declared,
        reason: `${reason}; self-declared ${declared} used as tiebreaker (partial evidence)`,
        usedSelfDeclared: true,
      };
    }
  }

  return { stage, reason, usedSelfDeclared: false };
}
