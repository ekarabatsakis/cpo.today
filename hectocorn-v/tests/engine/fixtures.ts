import { StartupInput, type StartupInputRaw } from "@/lib/schema/startup";

/** A minimal, neutral input: all scores land at or near 50 unless overridden. */
export function makeInput(overrides: Partial<StartupInputRaw> = {}): StartupInput {
  const base: StartupInputRaw = {
    name: "Baseline Co",
    oneLiner: "A neutral baseline company used by the engine tests.",
    sector: "saas",
    businessModel: "b2b_saas",
    foundedDate: "2024-01-01",
    hqRegion: "US",
    hqCountry: "US",
    team: {
      fullTimeEmployees: 2,
      founders: 2,
      foundersWithPriorExit: 0,
      foundersWithDomainYears: 5,
      technicalCofounder: true,
    },
    traction: { payingCustomers: 0 },
    financials: { monthlyBurnUsd: 10_000, cashOnHandUsd: 120_000 },
    funding: {},
    ip: { productStage: "mvp", techDefensibility: "medium" },
    market: {},
    risks: {},
  };
  return StartupInput.parse(deepMerge(base, overrides));
}

function deepMerge<T extends Record<string, unknown>>(a: T, b: Partial<T>): T {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      cur &&
      typeof cur === "object" &&
      !Array.isArray(cur)
    ) {
      out[k] = deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export const AS_OF = new Date("2026-09-18T00:00:00Z");
