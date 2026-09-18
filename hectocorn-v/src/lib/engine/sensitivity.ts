import { round } from "./helpers";
import { runEngine } from "./run";
import type { EngineOptions, EngineResult, SensitivityScenario } from "./types";
import type { Region } from "./benchmarks";
import type { StartupInput } from "@/lib/schema/startup";

/** Custom what-if overrides accepted by POST /api/sensitivity. */
export interface WhatIf {
  arrUsd?: number;
  payingCustomers?: number;
  patentsGranted?: number;
  operatingCountriesCount?: number;
  momGrowthPct?: number;
  hqRegion?: Region;
  runwayMonths?: number;
  targetRaiseUsd?: number;
  tamUsd?: number;
  somUsd?: number;
}

/** Returns a copy of the input with the what-if applied. */
export function applyWhatIf(input: StartupInput, w: WhatIf): StartupInput {
  const out = structuredClone(input);
  if (w.arrUsd !== undefined) out.traction.arrUsd = Math.max(0, w.arrUsd);
  if (w.payingCustomers !== undefined)
    out.traction.payingCustomers = Math.max(0, Math.round(w.payingCustomers));
  if (w.patentsGranted !== undefined)
    out.ip.patentsGranted = Math.max(0, Math.round(w.patentsGranted));
  if (w.operatingCountriesCount !== undefined) {
    const n = Math.max(0, Math.round(w.operatingCountriesCount));
    const current = out.operatingCountries;
    if (n <= current.length) out.operatingCountries = current.slice(0, n);
    else {
      const extra = Array.from({ length: n - current.length }, (_, i) => `+${i + 1}`);
      out.operatingCountries = [...current, ...extra];
    }
  }
  if (w.momGrowthPct !== undefined) out.traction.momGrowthPct = w.momGrowthPct;
  if (w.hqRegion !== undefined) out.hqRegion = w.hqRegion;
  if (w.runwayMonths !== undefined) {
    const burn = Math.max(out.financials.monthlyBurnUsd, 1);
    out.financials.cashOnHandUsd = Math.max(0, w.runwayMonths) * burn;
  }
  if (w.targetRaiseUsd !== undefined) {
    out.funding.targetRaiseUsd = Math.max(0, w.targetRaiseUsd);
    out.funding.currentlyRaising = w.targetRaiseUsd > 0;
  }
  if (w.tamUsd !== undefined) out.market.tamUsd = w.tamUsd > 0 ? w.tamUsd : undefined;
  if (w.somUsd !== undefined) out.market.somUsd = w.somUsd > 0 ? w.somUsd : undefined;
  return out;
}

interface ScenarioDef {
  key: string;
  label: string;
  description: string;
  apply: (input: StartupInput) => { input: StartupInput; noop?: boolean };
}

const SCENARIOS: ScenarioDef[] = [
  {
    key: "arr_up_50",
    label: "ARR +50%",
    description: "Annual recurring revenue grows by half.",
    apply: (i) => ({
      input: applyWhatIf(i, { arrUsd: i.traction.arrUsd * 1.5 }),
      noop: i.traction.arrUsd === 0,
    }),
  },
  {
    key: "arr_down_50",
    label: "ARR −50%",
    description: "Annual recurring revenue halves.",
    apply: (i) => ({
      input: applyWhatIf(i, { arrUsd: i.traction.arrUsd * 0.5 }),
      noop: i.traction.arrUsd === 0,
    }),
  },
  {
    key: "customer_plus_1",
    label: "+1 paying customer",
    description: "One more paying customer.",
    apply: (i) => ({ input: applyWhatIf(i, { payingCustomers: i.traction.payingCustomers + 1 }) }),
  },
  {
    key: "patent_plus_1",
    label: "+1 patent granted",
    description: "One more granted patent.",
    apply: (i) => ({ input: applyWhatIf(i, { patentsGranted: i.ip.patentsGranted + 1 }) }),
  },
  {
    key: "country_plus_1",
    label: "+1 operating country",
    description: "Customers in one more country.",
    apply: (i) => ({
      input: applyWhatIf(i, { operatingCountriesCount: i.operatingCountries.length + 1 }),
    }),
  },
  {
    key: "mom_plus_5",
    label: "MoM growth +5pp",
    description: "Month-over-month growth five points higher.",
    apply: (i) => ({ input: applyWhatIf(i, { momGrowthPct: (i.traction.momGrowthPct ?? 0) + 5 }) }),
  },
  {
    key: "region_us",
    label: "Region → US",
    description: "Headquartered in the US instead.",
    apply: (i) => ({ input: applyWhatIf(i, { hqRegion: "US" }), noop: i.hqRegion === "US" }),
  },
  {
    key: "runway_plus_12",
    label: "Runway +12 months",
    description: "Twelve more months of cash at the current burn.",
    apply: (i) => {
      const burn = Math.max(i.financials.monthlyBurnUsd, 1);
      const runway = i.financials.cashOnHandUsd / burn;
      return { input: applyWhatIf(i, { runwayMonths: runway + 12 }) };
    },
  },
];

/** Re-run the engine with one variable perturbed at a time (§5.6). */
export function runSensitivity(
  input: StartupInput,
  base: EngineResult,
  options: EngineOptions = {},
): SensitivityScenario[] {
  return SCENARIOS.map((s) => {
    const { input: perturbed, noop } = s.apply(input);
    const result = runEngine(perturbed, options);
    const deltaUsd = round(result.preMoneyUsd - base.preMoneyUsd);
    return {
      key: s.key,
      label: s.label,
      description: s.description,
      preMoneyUsd: result.preMoneyUsd,
      deltaUsd,
      deltaPct: base.preMoneyUsd > 0 ? round((deltaUsd / base.preMoneyUsd) * 100, 1) : 0,
      stage: result.stage,
      noop: noop || undefined,
    };
  });
}
