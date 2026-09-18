# Hectocorn V — Claude Code Build Script

> **How to use:** create an empty GitHub repo `hectocorn-v`, clone it, drop this file in the root as `CLAUDE.md`, open Claude Code in the folder and say:
> `Read CLAUDE.md and build the entire project exactly as specified. Work phase by phase, run the tests after each phase, and do not stop until Phase 8 is complete and `npm run build` passes.`

---

## 0. What we are building

**Hectocorn V** is an open-source, AI-assisted startup valuation platform. A founder (or investor) fills in a structured profile of a startup — team, traction, funding history, IP, geography, market — and gets back:

1. A **point estimate of valuation in USD**, plus a **low / base / high range**.
2. A **method-by-method breakdown** (Scorecard, Berkus, Risk-Factor Summation, VC Method, Revenue Multiples, Last-Round Anchor, Market-Size Cross-Check) with the weight each method carried.
3. An **AI investment memo** written by Claude: strengths, risks, comparables, what would move the number up, and a confidence score.
4. A **sensitivity view** ("what if ARR doubled / we added a second market / we raised at X").
5. A shareable, exportable **PDF report** carrying the Hectocorn V brand.

The number must be **deterministic first, AI second**: a transparent formula engine produces the numbers; Claude scores the qualitative inputs, estimates missing market data, and is allowed to adjust the final figure only inside a bounded band (±25%) with a written justification. Every result must be reproducible and every adjustment auditable.

---

## 1. Brand & design system (must match hectocorn.co exactly)

hectocorn.co is a Vite/React app on **shadcn/ui with the default "slate" theme and Tailwind**. Reproduce it exactly — do not invent a palette.

### 1.1 Logo
- Mark: a **black square (#0f172a) with rounded corners (8px) containing a white bold "V"**, centered. Build it as an inline SVG component `<HectocornVMark />` (default 32×32, scalable).
- Wordmark: `Hectocorn V` — "Hectocorn" in `font-bold`, then a space, then the mark rendered inline replacing the letter V. Text uses `text-foreground`.
- Favicon: the mark, exported to `/public/favicon.svg` and `/public/favicon.ico`.

```tsx
export function HectocornVMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Hectocorn V">
      <rect width="32" height="32" rx="8" fill="#0f172a" />
      <path d="M8 8 L16 25 L24 8" stroke="#ffffff" strokeWidth="4.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
```

### 1.2 Typography
The live site uses the Tailwind default sans stack (no web font is loaded). Use exactly:
```
font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
```
- H1 hero: `text-5xl md:text-7xl font-bold leading-tight` with gradient text: `bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent`
- H2 section: `text-4xl md:text-5xl font-bold` (48px), `text-foreground`
- H3 card: `text-xl font-semibold tracking-[-0.5px]` (20px)
- Subtitle / lead: `text-2xl text-muted-foreground` (24px, #64748b)
- Body: `text-base`; labels `text-sm font-medium`

### 1.3 Colour tokens (copy verbatim into `globals.css`)
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;        /* #020817 */
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;        /* #0f172a  slate-900 */
  --primary-foreground: 210 40% 98%;   /* #f8fafc */
  --secondary: 210 40% 96.1%;          /* #f1f5f9 */
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%; /* #64748b */
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;         /* #e2e8f0 */
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}
```
Dark mode: use the shadcn default slate dark block (`--background: 222.2 84% 4.9%` etc.). Ship a theme toggle but default to light, as the live site is light-only.

### 1.4 Component recipes observed on hectocorn.co
- **Primary button:** `bg-primary text-primary-foreground rounded-md h-11 px-8 text-sm font-medium hover:bg-primary/90`
- **Ghost link (nav/footer):** `text-muted-foreground hover:text-foreground text-base`
- **Card:** `rounded-lg border bg-card text-card-foreground shadow-sm` with `hover:shadow-lg transition-shadow`
- **Icon tile:** `w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center` (lucide icon inside, `text-primary`)
- **Hero section:** `relative min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10`
- **Nav:** sticky top, `bg-white/50 backdrop-blur border-b`, logo left, links + "Contact Us" primary button right
- **Section spacing:** `py-20 px-4`, container `max-w-6xl mx-auto`
- Icons: `lucide-react` only.

---

## 2. Tech stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Framework | **Next.js 15** (App Router, TypeScript strict, `src/` dir) |
| Styling | Tailwind CSS 3 + **shadcn/ui** (init with `slate` base colour, CSS variables on) |
| Forms | react-hook-form + zod |
| Charts | recharts |
| DB | Prisma + **SQLite** (zero-config for GitHub users; Postgres via `DATABASE_URL` swap) |
| AI | `@anthropic-ai/sdk`, model `claude-sonnet-4-6` (config in one place), tool-use for structured JSON, optional server-side web search for market sizing |
| PDF | `@react-pdf/renderer` |
| Auth | none in v1 (local tool). Reports are addressable by unguessable ID (`nanoid(16)`) |
| Tests | Vitest for the engine, Playwright smoke for the form → report flow |
| Lint/format | ESLint + Prettier, Husky pre-commit |
| CI | GitHub Actions: lint, typecheck, test, build |

`.env.example`:
```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
DATABASE_URL="file:./dev.db"
ENABLE_WEB_SEARCH=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 3. Repository layout

```
hectocorn-v/
├── CLAUDE.md                      ← this file
├── README.md                      ← badges, screenshots, quick start, methodology summary, disclaimer
├── LICENSE                        ← MIT
├── .env.example
├── .github/workflows/ci.yml
├── prisma/schema.prisma
├── prisma/seed.ts                 ← seeds the PlugSecure example (§7)
├── public/ (favicon.svg, favicon.ico, og-image.png)
├── src/
│   ├── app/
│   │   ├── layout.tsx             ← Nav + Footer, metadata, fonts
│   │   ├── page.tsx               ← Landing (hero, how it works, methods, CTA)
│   │   ├── evaluate/page.tsx      ← multi-step form wizard
│   │   ├── report/[id]/page.tsx   ← result page
│   │   ├── report/[id]/pdf/route.ts
│   │   ├── methodology/page.tsx   ← public explanation of every formula
│   │   └── api/
│   │       ├── valuate/route.ts   ← POST: validate → engine → AI → persist → {id}
│   │       ├── report/[id]/route.ts
│   │       └── sensitivity/route.ts
│   ├── components/
│   │   ├── brand/HectocornVMark.tsx, Wordmark.tsx
│   │   ├── layout/Nav.tsx, Footer.tsx
│   │   ├── form/ (StepTeam, StepTraction, StepFunding, StepIP, StepMarket, StepReview, StepIndicator)
│   │   ├── report/ (ValuationHeadline, RangeBar, MethodBreakdown, ScoreRadar, MemoSection, SensitivityPanel, ShareBar)
│   │   └── ui/ (shadcn generated)
│   ├── lib/
│   │   ├── schema/startup.ts      ← zod schema = single source of truth (§4)
│   │   ├── engine/                ← deterministic valuation engine (§5)
│   │   │   ├── index.ts
│   │   │   ├── stage.ts
│   │   │   ├── benchmarks.ts      ← multiples, stage medians, regional factors
│   │   │   ├── methods/scorecard.ts, berkus.ts, rfs.ts, vcMethod.ts, multiples.ts, anchor.ts, marketCheck.ts
│   │   │   ├── blend.ts
│   │   │   └── sensitivity.ts
│   │   ├── ai/
│   │   │   ├── client.ts
│   │   │   ├── score.ts           ← qualitative scoring (tool-use, strict JSON)
│   │   │   ├── market.ts          ← TAM/SAM/SOM estimation when not supplied
│   │   │   ├── memo.ts            ← investment memo + bounded adjustment
│   │   │   └── prompts.ts
│   │   ├── pdf/ReportDocument.tsx
│   │   └── db.ts
│   └── types/
└── tests/ (engine/*.test.ts, e2e/*.spec.ts)
```

---

## 4. Input schema (`src/lib/schema/startup.ts`)

This is the single source of truth. The form, the API, the engine and the AI prompts all import it. Every field has a `.describe()` that the form uses as a tooltip and the AI receives as context.

```ts
import { z } from "zod";

export const Sector = z.enum([
  "cybersecurity","saas","fintech","healthtech","biotech","climate_energy","deeptech_hardware",
  "ai_ml","marketplace","ecommerce","consumer","edtech","proptech","mobility","other",
]);
export const Region = z.enum(["EU","UK","US","MENA","APAC","LATAM","AFRICA","OTHER"]);
export const BusinessModel = z.enum(["b2b_saas","b2b_services","b2b2c","b2c_subscription","b2c_transactional","marketplace","hardware","licensing","other"]);
export const StageSelf = z.enum(["idea","pre_seed","seed","series_a","series_b_plus"]);

export const FundingRound = z.object({
  type: z.enum(["friends_family","angel","pre_seed","seed","series_a","series_b","grant","convertible_safe","other"]),
  date: z.string().describe("ISO date, e.g. 2025-04-01"),
  amountUsd: z.number().nonnegative(),
  postMoneyUsd: z.number().positive().optional().describe("Post-money valuation if priced"),
  leadInvestorType: z.enum(["vc","angel","corporate","accelerator","public_grant","none"]).optional(),
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
  operatingCountries: z.array(z.string()).default([]).describe("Countries where you have customers"),

  // Team
  team: z.object({
    fullTimeEmployees: z.number().int().min(1),
    founders: z.number().int().min(1),
    foundersWithPriorExit: z.number().int().min(0),
    foundersWithDomainYears: z.number().min(0).describe("Avg years of domain experience across founders"),
    technicalCofounder: z.boolean(),
    keyHiresPlanned12m: z.number().int().min(0).default(0),
    advisorsNotable: z.number().int().min(0).default(0),
  }),

  // Traction
  traction: z.object({
    payingCustomers: z.number().int().min(0),
    pilotsOrLOIs: z.number().int().min(0).default(0),
    arrUsd: z.number().min(0).default(0).describe("Annual recurring revenue"),
    nonRecurringRevenueTtmUsd: z.number().min(0).default(0).describe("Services/one-off revenue, trailing 12m"),
    momGrowthPct: z.number().min(-100).optional().describe("Avg month-over-month revenue growth, last 6m"),
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
    proprietaryData: z.boolean().default(false).describe("Unique dataset that compounds with usage"),
    certifications: z.array(z.string()).default([]).describe("e.g. ISO 27001, IEC 62443, SOC2, CE"),
    regulatoryTailwind: z.boolean().default(false).describe("Regulation forcing customers to buy, e.g. NIS2, CRA"),
    productStage: z.enum(["concept","prototype","mvp","launched","scaling"]),
    techDefensibility: z.enum(["low","medium","high"]).describe("How hard to replicate in 12 months"),
  }),

  // Market
  market: z.object({
    tamUsd: z.number().positive().optional(),
    samUsd: z.number().positive().optional(),
    somUsd: z.number().positive().optional(),
    marketCagrPct: z.number().optional(),
    competitorsNamed: z.array(z.string()).default([]),
    competitiveIntensity: z.enum(["low","medium","high"]).optional(),
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
  reportingCurrency: z.enum(["USD","EUR","GBP"]).default("USD"),
});
export type StartupInput = z.infer<typeof StartupInput>;
```

Currency: the form accepts EUR/GBP; the API converts to USD with a static rate table in `benchmarks.ts` (`EUR:1.08, GBP:1.27`, editable) and stores both the raw and the USD-normalised input.

---

## 5. Valuation engine (`src/lib/engine`) — deterministic, unit-tested

### 5.1 Stage detection (`stage.ts`)
Infer stage from data (self-declared stage is only a tiebreaker):

| Stage | Rule (first match) |
|---|---|
| `series_b_plus` | ARR ≥ $5M or last priced round ≥ Series B |
| `series_a` | ARR ≥ $1M or last priced round = Series A |
| `seed` | ARR ≥ $150k **or** paying customers ≥ 5 **or** last priced round = Seed with post ≥ $4M |
| `pre_seed` | product ≥ MVP and (paying ≥ 1 or raised ≥ $100k) |
| `idea` | otherwise |

### 5.2 Benchmarks (`benchmarks.ts`)
Keep all numbers in one file, typed, with a `source`/`asOf` note so users can update them. Initial values (2025–2026 European/US early-stage medians, editable):

```ts
export const STAGE_MEDIAN_PRE_MONEY_USD = { idea: 1.0e6, pre_seed: 3.5e6, seed: 9.0e6, series_a: 30e6, series_b_plus: 90e6 };
export const REGION_FACTOR = { US: 1.00, UK: 0.85, EU: 0.75, APAC: 0.80, MENA: 0.70, LATAM: 0.60, AFRICA: 0.50, OTHER: 0.65 };
export const SECTOR_ARR_MULTIPLE = { // EV/ARR for private early-stage, base | high-growth
  cybersecurity: [9, 15], saas: [7, 12], fintech: [7, 12], healthtech: [6, 10], biotech: [8, 14],
  climate_energy: [6, 11], deeptech_hardware: [5, 9], ai_ml: [10, 18], marketplace: [4, 8],
  ecommerce: [2, 4], consumer: [4, 8], edtech: [4, 7], proptech: [4, 7], mobility: [4, 8], other: [4, 8] };
export const SECTOR_EXIT_MULTIPLE_AT_SCALE = { cybersecurity: 8, saas: 7, fintech: 6, ... , other: 4 }; // EV/Revenue at exit
export const TARGET_ROI_BY_STAGE = { idea: 30, pre_seed: 20, seed: 10, series_a: 6, series_b_plus: 4 }; // VC method
export const YEARS_TO_EXIT_BY_STAGE = { idea: 8, pre_seed: 7, seed: 6, series_a: 5, series_b_plus: 4 };
export const DILUTION_TO_EXIT_BY_STAGE = { idea: 0.65, pre_seed: 0.60, seed: 0.50, series_a: 0.40, series_b_plus: 0.25 };
export const BERKUS_CAP_PER_FACTOR_USD = 750_000; // 5 factors → max $3.75M pre-revenue
export const FX_TO_USD = { USD: 1, EUR: 1.08, GBP: 1.27 };
```

### 5.3 Qualitative scores
Seven 0–100 scores feed several methods. They are computed **deterministically from the inputs** (`scoreFromInputs`) and then **optionally overridden by the AI scorer** (§6.1) which sees the narrative and names. The engine always keeps both versions and reports which was used.

| Score | Deterministic derivation (clamped 0–100) |
|---|---|
| `team` | 40 base + 10·technicalCofounder + 15·min(exits,2) + 2·min(domainYears,15) + 3·min(advisors,3) − 15·keyPersonDependency |
| `market` | from TAM: <$500M→30, <$2B→50, <$10B→70, ≥$10B→85; +10 if CAGR ≥ 15%; +10 regulatoryTailwind; −10 competitiveIntensity=high |
| `product` | concept 15 / prototype 35 / mvp 55 / launched 75 / scaling 90; +5 per certification (max 15) |
| `traction` | 0 customers→10; else 30 + 8·min(customers,5) + 4·min(customers−5,10 if >5) + 15 if ARR>0 + 10 if momGrowth ≥ 10% + 5·min(marqueeCustomers,2) + 5 if NRR ≥ 100 |
| `moat` | techDefensibility low 25 / med 50 / high 75; +10 patentsGranted>0; +5 patentsPending>0; +10 proprietaryData; +5 trademarks; −10 hardwareSupplyRisk |
| `financial` | 50; +10 if runway ≥ 18m, −15 if < 6m; +10 grossMargin ≥ 70, −10 < 40; +10 profitable; −15 if churn > 15% |
| `deal` | 50; +15 if last round led by VC; +10 if raised ≥ $500k; +5 per named partnership (max 15); −10 if customerConcentration > 50% |

`runwayMonths = cashOnHand / max(monthlyBurn, 1)`.

### 5.4 Methods — each returns `{ name, valuationUsd, applicable, weightHint, inputsUsed, notes[] }`

**A. Scorecard (Payne)** — `scorecard.ts`
`base = STAGE_MEDIAN_PRE_MONEY[stage] × REGION_FACTOR[region]`
Factors & weights: team 30%, market 25%, product/tech 15%, traction/sales 10%, competitive/moat 10%, financing need & deal 10%. Each factor multiplier = `0.5 + score/100` (so 50 → 1.0×, 100 → 1.5×, 0 → 0.5×). `valuation = base × Σ(weight × multiplier)`. Applicable: idea → seed.

**B. Berkus (extended)** — `berkus.ts`
Five factors, each `score/100 × BERKUS_CAP`: sound idea (market), prototype (product), quality team (team), strategic relationships (deal), product rollout/sales (traction). Sum, then × `REGION_FACTOR`. Applicable only when ARR < $250k. Weight hint low once ARR > 0.

**C. Risk-Factor Summation** — `rfs.ts`
Start at `STAGE_MEDIAN_PRE_MONEY × REGION_FACTOR`. Twelve risks each rated −2..+2 (management, stage, legislation/political, manufacturing/supply, sales & marketing, funding/capital, competition, technology, litigation, international, reputation, exit potential). Map from inputs (e.g. legislation = +1 if regulatoryTailwind, −1 if litigationRisk; manufacturing = −1 if hardwareSupplyRisk; international = +1 if operatingCountries ≥ 3). Each point = ±$250k × (base / $2.5M) so it scales with stage. Applicable: idea → seed.

**D. VC Method** — `vcMethod.ts`
`revenueAtExit = max(arr, nonRecurringTtm×0.5, 1) × (1+g)^years` where `g` = capped annual growth derived from momGrowth (`(1+mom)^12 − 1`, cap 300%) else stage default (idea 150%, pre_seed 120%, seed 100%, series_a 70%, series_b 40%).
If revenue < $50k, use SOM-based path: `revenueAtExit = min(SOM × 0.10, TAM × 0.005)` reached at exit.
`exitValue = revenueAtExit × SECTOR_EXIT_MULTIPLE_AT_SCALE`
`postMoneyToday = exitValue / TARGET_ROI × (1 − dilutionToExit)`
`preMoney = postMoneyToday − targetRaise (if currently raising)`.
Applicable: all stages; weight grows with revenue.

**E. Revenue Multiples** — `multiples.ts`
`multiple = lerp(low, high, growthQuality)` where `growthQuality ∈ [0,1]` from momGrowth (0% → 0, ≥ 15% → 1) blended 50/50 with NRR (≤ 90 → 0, ≥ 120 → 1); adjust −20% if grossMargin < 50%, −25% if churn > 20%.
`valuation = arr × multiple + nonRecurringTtm × 1.0`. Applicable when ARR ≥ $100k; weight hint scales with ARR (0.1 at $100k → 0.45 at $1M+).

**F. Last-Round Anchor** — `anchor.ts`
If a priced round exists: `anchor = postMoney × stepUp` where `stepUp = (1 + annualStepUp)^(yearsSince)`, `annualStepUp` = 0.25 + 0.5 × (tractionScore − 50)/50 (range ~0 → 0.75), floored at −0.30 if runway < 6m and no growth. Applicable when ≤ 36 months old; weight 0.35 if ≤ 12 months, 0.20 if ≤ 24, 0.10 after. Notes must state the original round explicitly.

**G. Market-Size Cross-Check** — `marketCheck.ts`
Not a valuation method; a **sanity band**. `ceiling = SOM × 3` (a company is rarely worth more than 3× the revenue it could plausibly capture); `floor = 0`. If the blended number exceeds the ceiling, cap it and add a warning flag. If TAM/SAM/SOM missing, request AI estimate (§6.2) and mark `market.hasEstimateFromAi = true`.

### 5.5 Blend (`blend.ts`)
1. Collect applicable methods and their `weightHint`.
2. Apply stage weight presets (then multiply by `weightHint`, renormalise):

| Stage | Scorecard | Berkus | RFS | VC | Multiples | Anchor |
|---|---|---|---|---|---|---|
| idea | 35 | 30 | 25 | 10 | 0 | 0 |
| pre_seed | 30 | 20 | 20 | 15 | 5 | 10 |
| seed | 20 | 5 | 15 | 25 | 20 | 15 |
| series_a | 5 | 0 | 5 | 35 | 45 | 10 |
| series_b_plus | 0 | 0 | 0 | 35 | 55 | 10 |

3. `base = weighted geometric mean` (geometric, not arithmetic — it resists one outlier method).
4. Apply market ceiling (G).
5. Range: `low = base × 0.70`, `high = base × 1.40`, widened to `×0.55 / ×1.70` when confidence < 50 (confidence = 100 − dispersion, where dispersion = coefficient of variation across methods × 100, clamped).
6. Output `pre-money` as the headline and also `impliedPostMoney = pre + targetRaise` when raising.

### 5.6 Sensitivity (`sensitivity.ts`)
Re-run the engine with one variable perturbed; return deltas for: ARR ±50%, +1 paying customer, +1 patent granted, +1 operating country, momGrowth +5pp, region → US, runway +12m. Also expose `POST /api/sensitivity` for custom what-ifs from the UI.

### 5.7 Engine contract
```ts
export interface EngineResult {
  stage: Stage; scores: Scores; scoresSource: "deterministic" | "ai";
  methods: MethodResult[]; weights: Record<string, number>;
  preMoneyUsd: number; lowUsd: number; highUsd: number; impliedPostMoneyUsd?: number;
  confidence: number; flags: string[]; marketCeilingUsd?: number;
  benchmarksVersion: string;
}
```
Tests must cover: every method in isolation with hand-computed expected values; stage detection edge cases; the PlugSecure fixture (§7) producing a pre-money **between $3.0M and $6.5M** with no exceptions; ceiling capping; geometric blend; currency conversion.

---

## 6. AI layer (`src/lib/ai`)

All calls: `claude-sonnet-4-6`, temperature 0.2, **tool-use with a strict JSON schema** for structured outputs (never regex-parse prose). Every prompt receives the zod schema descriptions plus the full normalised input. Log prompt version + model in the DB row.

### 6.1 Qualitative scorer (`score.ts`)
Input: startup JSON + deterministic scores. Task: return the seven scores (0–100), each with a one-sentence rationale, **staying within ±20 of the deterministic score unless the narrative/named customers/partners justify more**, and a `notableSignals[]` list. System prompt establishes it as a European seed-stage investor who is sceptical, benchmark-aware and explicitly rewards regulatory tailwinds, hard-to-replicate OT/deep-tech, and paying B2B logos.

### 6.2 Market estimator (`market.ts`)
Only runs if TAM/SAM/SOM missing. With `ENABLE_WEB_SEARCH=true`, enable the Anthropic web-search tool so Claude can cite public market reports; otherwise estimate from knowledge with wide bands. Returns `{ tamUsd, samUsd, somUsd, cagrPct, method, sources[], confidence }`. SOM must be derived bottom-up (customers × ACV reachable in 5 years), not as a % of TAM.

### 6.3 Memo + bounded adjustment (`memo.ts`)
Input: startup JSON, `EngineResult`, AI scores, market estimate. Returns:
```ts
{
  adjustmentPct: number;          // must be within [-25, 25]; server clamps and flags
  adjustmentRationale: string;
  finalPreMoneyUsd: number;       // = engine.preMoney × (1+adj), server recomputes — never trust the model's arithmetic
  memo: { summary; strengths[]; risks[]; comparables[{name, whyRelevant, indicativeValuation?}];
          whatMovesTheNumber[{lever, estimatedImpactPct}]; recommendedRaise?: {amountUsd, rationale};
          confidence: 0-100; },
  disclaimer: string;
}
```
The report page shows engine number → AI adjustment → final, with the rationale, so nothing is a black box.

### 6.4 Failure mode
If `ANTHROPIC_API_KEY` is missing or a call fails: still return the deterministic result, mark `aiStatus: "unavailable"`, and render the report without the memo. The tool must never fail to give a number.

---

## 7. Seed example — PlugSecure (`prisma/seed.ts`, also a "Load example" button on the form)

```json
{
  "name": "PlugSecure",
  "website": "https://plugsecure.io",
  "oneLiner": "Cybersecurity for critical energy infrastructure — securing EV charging (OCPP/CSMS), solar inverters, BESS and smart-grid assets for CPOs, utilities and OEMs.",
  "sector": "cybersecurity", "subSector": "OT/ICS security for EV charging & distributed energy",
  "businessModel": "b2b_saas", "foundedDate": "2025-01-01",
  "hqRegion": "EU", "hqCountry": "GR", "otherBranches": [], "operatingCountries": ["GR","UK","RO"],
  "team": { "fullTimeEmployees": 3, "founders": 2, "foundersWithPriorExit": 1, "foundersWithDomainYears": 10, "technicalCofounder": true, "keyHiresPlanned12m": 2, "advisorsNotable": 1 },
  "traction": { "payingCustomers": 3, "pilotsOrLOIs": 2, "arrUsd": 0, "nonRecurringRevenueTtmUsd": 0, "marqueeCustomers": [], "partnerships": [], "pipelineWeightedUsd": 0 },
  "financials": { "monthlyBurnUsd": 0, "cashOnHandUsd": 0, "isProfitable": false },
  "funding": { "rounds": [{ "type": "pre_seed", "date": "2025-04-01", "amountUsd": 720000, "postMoneyUsd": 2620000, "leadInvestorType": "vc" }], "totalRaisedUsd": 720000, "currentlyRaising": true, "targetRaiseUsd": 1500000, "grantsNonDilutiveUsd": 0 },
  "ip": { "patentsGranted": 1, "patentsPending": 0, "trademarksRegistered": true, "proprietaryData": true, "certifications": [], "regulatoryTailwind": true, "productStage": "launched", "techDefensibility": "high" },
  "market": { "competitorsNamed": [], "competitiveIntensity": "medium" },
  "risks": { "keyPersonDependency": true, "hardwareSupplyRisk": false, "litigationOrRegulatoryRisk": false },
  "narrative": "NIS2 and the Cyber Resilience Act force CPOs and energy-asset operators to secure OCPP/Modbus/DNP3 endpoints. Founders previously built and sold a company to PPC Group, Greece's largest utility. Product is live with paying customers in three countries.",
  "selfDeclaredStage": "pre_seed", "reportingCurrency": "USD"
}
```
Fields marked `0` above (ARR, burn, cash, revenue numbers) are placeholders — the wizard must make it obvious these matter and let the user fill them. The example's amounts were entered in EUR originally; the seed stores USD-converted values already.

---

## 8. Build phases (Claude Code executes in order; run tests after each)

**Phase 1 — Scaffold.** `npx create-next-app@latest` (TS, Tailwind, ESLint, App Router, src/). `npx shadcn@latest init` (slate, CSS vars). Add components: button, card, input, label, select, switch, textarea, tabs, tooltip, badge, progress, separator, dialog, toast, sheet, slider. Paste §1.3 tokens. Prisma + SQLite. Husky, Prettier, CI workflow. Commit.

**Phase 2 — Brand & layout.** `HectocornVMark`, `Wordmark`, `Nav`, `Footer`, favicon, OG image (1200×630, mark + "Hectocorn V — AI startup valuation"). Landing page replicating hectocorn.co's structure: hero (gradient H1 "Know what your startup is worth."; lead in `text-muted-foreground`; primary CTA "Evaluate a startup" → `/evaluate`; ghost CTA "See the methodology"), 3 icon-tile feature cards (Transparent methods / AI investment memo / Instant PDF report), "Seven methods, one number" section with 6 cards, footer with hectocorn.co link, LinkedIn, disclaimer. Commit.

**Phase 3 — Schema & engine.** §4 schema, §5 engine, benchmarks, full Vitest suite (≥ 40 tests). Commit.

**Phase 4 — Wizard.** 6 steps with `StepIndicator`; autosave to `localStorage`; zod inline validation; currency toggle; "Load PlugSecure example" button; review step shows a summary table and a "Run valuation" primary button with a loading state ("Scoring team… Estimating market… Writing memo…" progress messages driven by server-sent events or polling `/api/report/[id]/status`). Commit.

**Phase 5 — API & AI.** `/api/valuate` pipeline: validate → normalise FX → engine → (parallel) AI scorer + market estimator → engine re-run with AI scores → memo → clamp adjustment → persist `Report` row (input, engineResult, aiResult, finalPreMoneyUsd, status, timings) → return `{ id }`. Rate-limit 10 req/min per IP. Commit.

**Phase 6 — Report page.** `ValuationHeadline` (big number, range, stage badge, confidence ring), `RangeBar` (low/base/high with the last-round post-money marker if any), `MethodBreakdown` (recharts horizontal bars + weight pills; click → drawer with the method's inputs and notes), `ScoreRadar` (7 scores, deterministic vs AI overlay), `MemoSection`, `SensitivityPanel` (sliders → live re-run via `/api/sensitivity`), `ShareBar` (copy link, download PDF, "Evaluate another"). Methodology page reproduces §5 in plain English. Commit.

**Phase 7 — PDF.** `@react-pdf/renderer` document: cover (mark, startup name, date, headline number), summary, methods table, memo, disclaimer. Brand colours from §1.3. Route streams `application/pdf`. Commit.

**Phase 8 — Polish & release.** Playwright e2e: load example → run → report renders → PDF downloads. Lighthouse ≥ 90 performance/accessibility on landing. README with screenshots (Playwright captures them), quick start (`cp .env.example .env && npm i && npx prisma migrate dev && npm run db:seed && npm run dev`), methodology summary, "How to update benchmarks", contributing guide, and this disclaimer verbatim:

> Hectocorn V produces indicative estimates for educational and discussion purposes. It is not a valuation opinion, investment advice, or a substitute for professional advice. Valuations are ultimately set by negotiation between parties.

Tag `v1.0.0`.

---

## 9. Non-negotiables

- No number leaves the engine without a method trail; the UI never shows an AI figure without the engine figure beside it.
- Server recomputes every arithmetic result the model returns.
- All benchmark constants live in `benchmarks.ts` with a version string surfaced in the report footer.
- Works fully offline (minus AI) — a user without an API key still gets a report.
- The brand must be pixel-consistent with hectocorn.co: slate tokens, system font stack, gradient hero text, `rounded-lg` cards, `lucide` icons, black-box-white-V mark.
- TypeScript strict, zero `any`, zero ESLint warnings at `npm run build`.
