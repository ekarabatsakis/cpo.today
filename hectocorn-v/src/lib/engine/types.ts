import type { Stage } from "./benchmarks";

export type { Stage } from "./benchmarks";

export type ScoreKey = "team" | "market" | "product" | "traction" | "moat" | "financial" | "deal";
export const SCORE_KEYS: readonly ScoreKey[] = [
  "team",
  "market",
  "product",
  "traction",
  "moat",
  "financial",
  "deal",
];

/** Seven qualitative scores, each 0–100. */
export type Scores = Record<ScoreKey, number>;

export type MethodKey = "scorecard" | "berkus" | "rfs" | "vc" | "multiples" | "anchor";
export const METHOD_KEYS: readonly MethodKey[] = [
  "scorecard",
  "berkus",
  "rfs",
  "vc",
  "multiples",
  "anchor",
];

export type InputsUsed = Record<string, number | string | boolean | null>;

export interface MethodResult {
  key: MethodKey;
  name: string;
  /** Pre-money valuation in USD. 0 when not applicable. */
  valuationUsd: number;
  applicable: boolean;
  /** 0–1 multiplier on the stage preset weight. */
  weightHint: number;
  inputsUsed: InputsUsed;
  notes: string[];
}

export interface MarketCheckResult {
  /** SOM × 3 when SOM is known. */
  ceilingUsd?: number;
  floorUsd: number;
  applied: boolean;
  missing: boolean;
  notes: string[];
}

export type ScoresSource = "deterministic" | "ai";

export interface EngineOptions {
  /** Reference date for "years since" calculations. Defaults to now. */
  asOf?: Date;
  /** Override the deterministic scores (e.g. with AI scores). */
  scores?: Scores;
  scoresSource?: ScoresSource;
}

export interface EngineResult {
  stage: Stage;
  stageReason: string;
  scores: Scores;
  deterministicScores: Scores;
  aiScores?: Scores;
  scoresSource: ScoresSource;
  methods: MethodResult[];
  /** Normalised weights (sum = 1) over the applicable methods. */
  weights: Record<string, number>;
  /** Weighted geometric mean before the market ceiling. */
  blendedUsd: number;
  preMoneyUsd: number;
  lowUsd: number;
  highUsd: number;
  impliedPostMoneyUsd?: number;
  /** 100 − dispersion (coefficient of variation × 100), clamped to 0–100. */
  confidence: number;
  flags: string[];
  marketCeilingUsd?: number;
  runwayMonths: number;
  benchmarksVersion: string;
  asOf: string;
}

export interface SensitivityScenario {
  key: string;
  label: string;
  description: string;
  preMoneyUsd: number;
  deltaUsd: number;
  deltaPct: number;
  stage: Stage;
  /** True when the perturbation could not change anything (e.g. ARR is 0). */
  noop?: boolean;
}
