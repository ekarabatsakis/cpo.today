/**
 * Hectocorn V benchmarks — every numeric constant the engine uses lives here.
 *
 * Update the values, bump BENCHMARKS_VERSION and note the source/asOf so every
 * report carries the version it was computed with.
 */
export const BENCHMARKS_VERSION = "2026.09";

export const BENCHMARKS_META = {
  version: BENCHMARKS_VERSION,
  asOf: "2026-09-01",
  source:
    "Blend of published 2025–2026 European and US early-stage medians (Carta, PitchBook, Dealroom, public SaaS multiples). Editable.",
} as const;

export type Stage = "idea" | "pre_seed" | "seed" | "series_a" | "series_b_plus";
export const STAGES: readonly Stage[] = ["idea", "pre_seed", "seed", "series_a", "series_b_plus"];

export type Region = "EU" | "UK" | "US" | "MENA" | "APAC" | "LATAM" | "AFRICA" | "OTHER";

export type Sector =
  | "cybersecurity"
  | "saas"
  | "fintech"
  | "healthtech"
  | "biotech"
  | "climate_energy"
  | "deeptech_hardware"
  | "ai_ml"
  | "marketplace"
  | "ecommerce"
  | "consumer"
  | "edtech"
  | "proptech"
  | "mobility"
  | "other";

export type Currency = "USD" | "EUR" | "GBP";

/** Median pre-money valuation by stage, USD. */
export const STAGE_MEDIAN_PRE_MONEY_USD: Record<Stage, number> = {
  idea: 1.0e6,
  pre_seed: 3.5e6,
  seed: 9.0e6,
  series_a: 30e6,
  series_b_plus: 90e6,
};

/** Regional discount/premium relative to the US market. */
export const REGION_FACTOR: Record<Region, number> = {
  US: 1.0,
  UK: 0.85,
  EU: 0.75,
  APAC: 0.8,
  MENA: 0.7,
  LATAM: 0.6,
  AFRICA: 0.5,
  OTHER: 0.65,
};

/** EV/ARR for private early-stage companies: [base, high-growth]. */
export const SECTOR_ARR_MULTIPLE: Record<Sector, readonly [number, number]> = {
  cybersecurity: [9, 15],
  saas: [7, 12],
  fintech: [7, 12],
  healthtech: [6, 10],
  biotech: [8, 14],
  climate_energy: [6, 11],
  deeptech_hardware: [5, 9],
  ai_ml: [10, 18],
  marketplace: [4, 8],
  ecommerce: [2, 4],
  consumer: [4, 8],
  edtech: [4, 7],
  proptech: [4, 7],
  mobility: [4, 8],
  other: [4, 8],
};

/** EV/Revenue at exit (at scale), used by the VC method. */
export const SECTOR_EXIT_MULTIPLE_AT_SCALE: Record<Sector, number> = {
  cybersecurity: 8,
  saas: 7,
  fintech: 6,
  healthtech: 6,
  biotech: 7,
  climate_energy: 5,
  deeptech_hardware: 5,
  ai_ml: 9,
  marketplace: 4,
  ecommerce: 2,
  consumer: 4,
  edtech: 4,
  proptech: 4,
  mobility: 4,
  other: 4,
};

/** Target multiple on invested capital a fund needs by entry stage (VC method). */
export const TARGET_ROI_BY_STAGE: Record<Stage, number> = {
  idea: 30,
  pre_seed: 20,
  seed: 10,
  series_a: 6,
  series_b_plus: 4,
};

export const YEARS_TO_EXIT_BY_STAGE: Record<Stage, number> = {
  idea: 8,
  pre_seed: 7,
  seed: 6,
  series_a: 5,
  series_b_plus: 4,
};

/** Cumulative dilution expected between now and exit. */
export const DILUTION_TO_EXIT_BY_STAGE: Record<Stage, number> = {
  idea: 0.65,
  pre_seed: 0.6,
  seed: 0.5,
  series_a: 0.4,
  series_b_plus: 0.25,
};

/** Default annual revenue growth when no month-over-month figure is supplied (VC method). */
export const DEFAULT_ANNUAL_GROWTH_BY_STAGE: Record<Stage, number> = {
  idea: 1.5,
  pre_seed: 1.2,
  seed: 1.0,
  series_a: 0.7,
  series_b_plus: 0.4,
};

/** Cap on the annualised growth derived from month-over-month growth (VC method). */
export const MAX_ANNUAL_GROWTH = 3.0;

/** Berkus: five factors, each worth at most this amount → max $3.75M pre-revenue. */
export const BERKUS_CAP_PER_FACTOR_USD = 750_000;

/** Risk-Factor Summation: value of one risk point at a $2.5M base. Scales with base. */
export const RFS_POINT_VALUE_USD = 250_000;
export const RFS_REFERENCE_BASE_USD = 2_500_000;

/** Market cross-check: a company is rarely worth more than this multiple of its SOM. */
export const MARKET_CEILING_SOM_MULTIPLE = 3;

/** Static FX table used to normalise EUR/GBP inputs to USD. */
export const FX_TO_USD: Record<Currency, number> = { USD: 1, EUR: 1.08, GBP: 1.27 };

/** Blend presets: relative weight of each method by stage (before weight hints). */
export const STAGE_WEIGHT_PRESETS: Record<
  Stage,
  Record<"scorecard" | "berkus" | "rfs" | "vc" | "multiples" | "anchor", number>
> = {
  idea: { scorecard: 35, berkus: 30, rfs: 25, vc: 10, multiples: 0, anchor: 0 },
  pre_seed: { scorecard: 30, berkus: 20, rfs: 20, vc: 15, multiples: 5, anchor: 10 },
  seed: { scorecard: 20, berkus: 5, rfs: 15, vc: 25, multiples: 20, anchor: 15 },
  series_a: { scorecard: 5, berkus: 0, rfs: 5, vc: 35, multiples: 45, anchor: 10 },
  series_b_plus: { scorecard: 0, berkus: 0, rfs: 0, vc: 35, multiples: 55, anchor: 10 },
};

/** Range multipliers around the blended base. */
export const RANGE_NORMAL = { low: 0.7, high: 1.4 } as const;
export const RANGE_WIDE = { low: 0.55, high: 1.7 } as const;
export const RANGE_WIDE_CONFIDENCE_THRESHOLD = 50;

/** Bounded band for the AI's adjustment to the engine number, in percent. */
export const AI_ADJUSTMENT_MAX_PCT = 25;
