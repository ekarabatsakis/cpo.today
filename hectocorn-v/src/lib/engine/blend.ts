import {
  RANGE_NORMAL,
  RANGE_WIDE,
  RANGE_WIDE_CONFIDENCE_THRESHOLD,
  STAGE_WEIGHT_PRESETS,
  type Stage,
} from "./benchmarks";
import { clamp, round } from "./helpers";
import type { MethodKey, MethodResult } from "./types";

/** Method valuations below this are floored inside the log-blend so one degenerate method cannot zero the result. */
export const BLEND_FLOOR_USD = 50_000;

export interface BlendResult {
  weights: Record<string, number>;
  blendedUsd: number;
  confidence: number;
  dispersion: number;
  lowUsd: number;
  highUsd: number;
  flags: string[];
}

/** Stage preset × weight hint for each applicable method, renormalised to sum to 1. */
export function blendWeights(methods: MethodResult[], stage: Stage): Record<string, number> {
  const presets = STAGE_WEIGHT_PRESETS[stage];
  const raw: Record<string, number> = {};
  let total = 0;
  for (const m of methods) {
    if (!m.applicable || m.valuationUsd <= 0) continue;
    const w = presets[m.key as MethodKey] * m.weightHint;
    if (w <= 0) continue;
    raw[m.key] = w;
    total += w;
  }
  const weights: Record<string, number> = {};
  for (const [k, w] of Object.entries(raw)) weights[k] = w / total;
  return weights;
}

/** exp(Σ wᵢ · ln vᵢ) — the weighted geometric mean. */
export function weightedGeometricMean(values: number[], weights: number[]): number {
  let sumW = 0;
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    if (weights[i] <= 0) continue;
    acc += weights[i] * Math.log(values[i]);
    sumW += weights[i];
  }
  return sumW === 0 ? 0 : Math.exp(acc / sumW);
}

/** Coefficient of variation × 100 across the applicable method valuations, clamped 0–100. */
export function dispersion(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return clamp((Math.sqrt(variance) / mean) * 100, 0, 100);
}

export function blend(methods: MethodResult[], stage: Stage): BlendResult {
  const flags: string[] = [];
  const weights = blendWeights(methods, stage);
  const keys = Object.keys(weights);
  const used = methods.filter((m) => keys.includes(m.key));

  let blendedUsd: number;
  if (used.length === 0) {
    flags.push("no_applicable_methods");
    blendedUsd = 0;
  } else {
    const values = used.map((m) => {
      if (m.valuationUsd < BLEND_FLOOR_USD) flags.push(`method_floored:${m.key}`);
      return Math.max(m.valuationUsd, BLEND_FLOOR_USD);
    });
    blendedUsd = weightedGeometricMean(
      values,
      used.map((m) => weights[m.key]),
    );
  }
  if (used.length > 0 && used.length < 3) flags.push("few_methods");

  const disp = dispersion(used.map((m) => m.valuationUsd));
  const confidence = round(clamp(100 - disp, 0, 100));
  const range = confidence < RANGE_WIDE_CONFIDENCE_THRESHOLD ? RANGE_WIDE : RANGE_NORMAL;
  if (range === RANGE_WIDE) flags.push("low_confidence_wide_range");

  return {
    weights,
    blendedUsd: round(blendedUsd),
    confidence,
    dispersion: round(disp, 1),
    lowUsd: round(blendedUsd * range.low),
    highUsd: round(blendedUsd * range.high),
    flags,
  };
}
