import { z } from "zod";

/**
 * Hectocorn V input schema — the single source of truth.
 * The form, the API, the engine and the AI prompts all import it.
 * Every `.describe()` doubles as a form tooltip and as context for Claude.
 */

export const Sector = z.enum([
  "cybersecurity",
  "saas",
  "fintech",
  "healthtech",
  "biotech",
  "climate_energy",
  "deeptech_hardware",
  "ai_ml",
  "marketplace",
  "ecommerce",
  "consumer",
  "edtech",
  "proptech",
  "mobility",
  "other",
]);
export const Region = z.enum(["EU", "UK", "US", "MENA", "APAC", "LATAM", "AFRICA", "OTHER"]);
export const BusinessModel = z.enum([
  "b2b_saas",
  "b2b_services",
  "b2b2c",
  "b2c_subscription",
  "b2c_transactional",
  "marketplace",
  "hardware",
  "licensing",
  "other",
]);
export const StageSelf = z.enum(["idea", "pre_seed", "seed", "series_a", "series_b_plus"]);
export const ProductStage = z.enum(["concept", "prototype", "mvp", "launched", "scaling"]);
export const Level = z.enum(["low", "medium", "high"]);
export const RoundType = z.enum([
  "friends_family",
  "angel",
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "grant",
  "convertible_safe",
  "other",
]);
export const LeadInvestorType = z.enum([
  "vc",
  "angel",
  "corporate",
  "accelerator",
  "public_grant",
  "none",
]);
export const ReportingCurrency = z.enum(["USD", "EUR", "GBP"]);

export const FundingRound = z.object({
  type: RoundType,
  date: z.string().describe("ISO date, e.g. 2025-04-01"),
  amountUsd: z.number().nonnegative(),
  postMoneyUsd: z.number().positive().optional().describe("Post-money valuation if priced"),
  leadInvestorType: LeadInvestorType.optional(),
});

export const StartupInput = z.object({
  // Identity
  name: z.string().min(1),
  website: z.string().url().optional(),
  oneLiner: z.string().min(10).max(300).describe("What you do, for whom, in one sentence"),
  sector: Sector,
  subSector: z.string().optional().describe("e.g. OT/ICS security for EV charging & energy assets"),
  businessModel: BusinessModel,
  foundedDate: z.string().describe("ISO date"),
  hqRegion: Region,
  hqCountry: z.string().length(2).describe("ISO-3166 alpha-2, e.g. GR"),
  otherBranches: z.array(z.string()).default([]).describe("Countries with an office/entity"),
  operatingCountries: z
    .array(z.string())
    .default([])
    .describe("Countries where you have customers"),

  // Team
  team: z.object({
    fullTimeEmployees: z.number().int().min(1),
    founders: z.number().int().min(1),
    foundersWithPriorExit: z.number().int().min(0),
    foundersWithDomainYears: z
      .number()
      .min(0)
      .describe("Avg years of domain experience across founders"),
    technicalCofounder: z.boolean(),
    keyHiresPlanned12m: z.number().int().min(0).default(0),
    advisorsNotable: z.number().int().min(0).default(0),
  }),

  // Traction
  traction: z.object({
    payingCustomers: z.number().int().min(0),
    pilotsOrLOIs: z.number().int().min(0).default(0),
    arrUsd: z.number().min(0).default(0).describe("Annual recurring revenue"),
    nonRecurringRevenueTtmUsd: z
      .number()
      .min(0)
      .default(0)
      .describe("Services/one-off revenue, trailing 12m"),
    momGrowthPct: z
      .number()
      .min(-100)
      .optional()
      .describe("Avg month-over-month revenue growth, last 6m"),
    grossMarginPct: z.number().min(-100).max(100).optional(),
    churnAnnualPct: z.number().min(0).max(100).optional(),
    netRevenueRetentionPct: z.number().min(0).optional(),
    avgContractValueUsd: z.number().min(0).optional(),
    salesCycleDays: z.number().int().min(0).optional(),
    pipelineWeightedUsd: z.number().min(0).default(0),
    marqueeCustomers: z.array(z.string()).default([]).describe("Names of notable logos"),
    partnerships: z.array(z.string()).default([]),
  }),

  // Financials
  financials: z.object({
    monthlyBurnUsd: z.number().min(0),
    cashOnHandUsd: z.number().min(0),
    revenueForecast12mUsd: z.number().min(0).optional(),
    isProfitable: z.boolean().default(false),
  }),

  // Funding history
  funding: z.object({
    rounds: z.array(FundingRound).default([]),
    totalRaisedUsd: z.number().min(0).default(0),
    currentlyRaising: z.boolean().default(false),
    targetRaiseUsd: z.number().min(0).optional(),
    grantsNonDilutiveUsd: z.number().min(0).default(0),
  }),

  // IP & product
  ip: z.object({
    patentsGranted: z.number().int().min(0).default(0),
    patentsPending: z.number().int().min(0).default(0),
    trademarksRegistered: z.boolean().default(false),
    proprietaryData: z
      .boolean()
      .default(false)
      .describe("Unique dataset that compounds with usage"),
    certifications: z.array(z.string()).default([]).describe("e.g. ISO 27001, IEC 62443, SOC2, CE"),
    regulatoryTailwind: z
      .boolean()
      .default(false)
      .describe("Regulation forcing customers to buy, e.g. NIS2, CRA"),
    productStage: ProductStage,
    techDefensibility: Level.describe("How hard to replicate in 12 months"),
  }),

  // Market
  market: z.object({
    tamUsd: z.number().positive().optional(),
    samUsd: z.number().positive().optional(),
    somUsd: z.number().positive().optional(),
    marketCagrPct: z.number().optional(),
    competitorsNamed: z.array(z.string()).default([]),
    competitiveIntensity: Level.optional(),
    hasEstimateFromAi: z.boolean().default(false), // set server-side
  }),

  // Risk flags & narrative
  risks: z.object({
    keyPersonDependency: z.boolean().default(false),
    singleCustomerConcentrationPct: z.number().min(0).max(100).optional(),
    litigationOrRegulatoryRisk: z.boolean().default(false),
    hardwareSupplyRisk: z.boolean().default(false),
  }),
  narrative: z.string().max(3000).optional().describe("Anything else — vision, moat, why now"),

  // Meta
  selfDeclaredStage: StageSelf.optional(),
  reportingCurrency: ReportingCurrency.default("USD"),
});

export type StartupInput = z.infer<typeof StartupInput>;
/** The shape before zod defaults are applied (what the form and API accept). */
export type StartupInputRaw = z.input<typeof StartupInput>;
export type FundingRound = z.infer<typeof FundingRound>;

/**
 * Flattened field descriptions ("team.technicalCofounder" → text) for tooltips
 * and for the AI prompts. Derived from the schema so it never drifts.
 */
export function schemaDescriptions(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (schema: z.ZodTypeAny, prefix: string) => {
    const unwrapped = unwrap(schema);
    if (unwrapped.description) out[prefix] = unwrapped.description;
    if (unwrapped instanceof z.ZodObject) {
      for (const [key, child] of Object.entries(unwrapped.shape as Record<string, z.ZodTypeAny>)) {
        walk(child, prefix ? `${prefix}.${key}` : key);
      }
    }
  };
  walk(StartupInput, "");
  return out;
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let s = schema;
  for (let i = 0; i < 5; i++) {
    if (s instanceof z.ZodOptional || s instanceof z.ZodNullable) {
      const inner = s.unwrap();
      if (!inner.description && s.description) return s;
      s = inner;
    } else if (s instanceof z.ZodDefault) {
      const inner = s.removeDefault();
      if (!inner.description && s.description) return s;
      s = inner;
    } else break;
  }
  return s;
}
