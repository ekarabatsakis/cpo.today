import type { Metadata } from "next";
import Link from "next/link";

import { DISCLAIMER } from "@/components/layout/Footer";
import {
  AI_ADJUSTMENT_MAX_PCT,
  BENCHMARKS_META,
  BERKUS_CAP_PER_FACTOR_USD,
  DILUTION_TO_EXIT_BY_STAGE,
  FX_TO_USD,
  REGION_FACTOR,
  SECTOR_ARR_MULTIPLE,
  SECTOR_EXIT_MULTIPLE_AT_SCALE,
  STAGE_MEDIAN_PRE_MONEY_USD,
  STAGE_WEIGHT_PRESETS,
  STAGES,
  TARGET_ROI_BY_STAGE,
  YEARS_TO_EXIT_BY_STAGE,
} from "@/lib/engine/benchmarks";
import { REGION_LABELS, SECTOR_LABELS, STAGE_LABELS } from "@/lib/schema/labels";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "Every formula behind a Hectocorn V valuation, in plain English, with the benchmark tables.",
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-4xl font-bold text-foreground md:text-5xl">{title}</h2>
      <div className="space-y-4 text-base leading-relaxed">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h3 className="mb-3 text-xl font-semibold tracking-[-0.5px]">{title}</h3>
      <div className="space-y-3 text-base">{children}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const F = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-secondary px-1.5 py-0.5 text-sm">{children}</code>
);

export default function MethodologyPage() {
  const toc = [
    ["overview", "Overview"],
    ["stage", "Stage detection"],
    ["scores", "Qualitative scores"],
    ["methods", "The methods"],
    ["blend", "Blending"],
    ["sensitivity", "Sensitivity"],
    ["ai", "The AI layer"],
    ["benchmarks", "Benchmarks"],
  ];
  return (
    <main className="px-4 py-12">
      <div className="mx-auto max-w-6xl space-y-16">
        <div className="space-y-4">
          <h1 className="text-5xl font-bold leading-tight md:text-7xl">Methodology</h1>
          <p className="max-w-3xl text-2xl text-muted-foreground">
            Deterministic first, AI second. Every number on a report comes from the formulas on this
            page, with constants from a single benchmarks file.
          </p>
          <nav aria-label="Sections" className="flex flex-wrap gap-2">
            {toc.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>

        <Section id="overview" title="Overview">
          <p>
            You describe the startup: team, traction, funding history, IP, market and risks. The
            engine infers the stage, computes seven qualitative scores, runs six valuation methods,
            blends the applicable ones with a weighted geometric mean, and checks the result against
            the size of the reachable market. That number is reproducible: the same inputs always
            give the same output.
          </p>
          <p>
            Only then does Claude look at the profile. It may re-score the seven qualitative
            factors, estimate the market when you did not supply one, and write an investment memo
            with an adjustment of at most ±{AI_ADJUSTMENT_MAX_PCT}%. The engine number is always
            shown next to the final number, the adjustment is clamped and recomputed by the server,
            and every method exposes the inputs it used.
          </p>
          <p>
            Amounts entered in EUR or GBP are converted with a static table (
            {Object.entries(FX_TO_USD)
              .map(([k, v]) => `${k} ${v}`)
              .join(", ")}
            ) before anything runs.
          </p>
        </Section>

        <Section id="stage" title="Stage detection">
          <p>
            The stage is inferred from the data, first rule that matches. The self-declared stage
            only breaks ties: it can lift the result by one stage when there is partial evidence for
            it, never lower it.
          </p>
          <Table
            head={["Stage", "Rule"]}
            rows={[
              ["Series B+", "ARR ≥ $5M, or the last priced round was a Series B or later"],
              ["Series A", "ARR ≥ $1M, or the last priced round was a Series A"],
              ["Seed", "ARR ≥ $150k, or 5+ paying customers, or a priced Seed at ≥ $4M post-money"],
              ["Pre-seed", "Product at MVP or beyond, and (a paying customer or ≥ $100k raised)"],
              ["Idea", "Otherwise"],
            ]}
          />
        </Section>

        <Section id="scores" title="Qualitative scores">
          <p>
            Seven scores from 0 to 100, computed from the inputs and clamped. The AI scorer may
            override them (staying within ±20 unless the narrative justifies more); the report shows
            both.
          </p>
          <Table
            head={["Score", "Formula"]}
            rows={[
              [
                "Team",
                "40 + 10 if technical co-founder + 15 × min(prior exits, 2) + 2 × min(domain years, 15) + 3 × min(advisors, 3) − 15 if key-person dependency",
              ],
              [
                "Market",
                "From TAM: < $500M → 30, < $2B → 50, < $10B → 70, ≥ $10B → 85 (no TAM → 50); +10 if CAGR ≥ 15%; +10 regulatory tailwind; −10 if competition is high",
              ],
              [
                "Product",
                "concept 15 / prototype 35 / MVP 55 / launched 75 / scaling 90; +5 per certification (max +15)",
              ],
              [
                "Traction",
                "No customers → 10; else 30 + 8 × min(customers, 5) + 4 × min(customers − 5, 10) + 15 if ARR > 0 + 10 if MoM growth ≥ 10% + 5 × min(marquee logos, 2) + 5 if NRR ≥ 100%",
              ],
              [
                "Moat",
                "defensibility low 25 / medium 50 / high 75; +10 patents granted; +5 patents pending; +10 proprietary data; +5 trademarks; −10 hardware supply risk",
              ],
              [
                "Financial",
                "50; +10 if runway ≥ 18 months, −15 if < 6; +10 if gross margin ≥ 70%, −10 if < 40%; +10 if profitable; −15 if churn > 15%",
              ],
              [
                "Deal",
                "50; +15 if the last round was VC-led; +10 if ≥ $500k raised; +5 per named partnership (max +15); −10 if one customer is > 50% of revenue",
              ],
            ]}
          />
          <p className="text-sm text-muted-foreground">
            Runway = cash on hand ÷ max(monthly burn, 1).
          </p>
        </Section>

        <Section id="methods" title="The methods">
          <div className="grid gap-6 md:grid-cols-2">
            <Sub title="A. Scorecard (Payne)">
              <p>
                Start from the stage median pre-money × the region factor. Six factors each get a
                multiplier of <F>0.5 + score/100</F> (a 50 is 1.0×, a 100 is 1.5×), weighted team
                30%, market 25%, product 15%, traction 10%, moat 10%, deal 10%. Applicable up to
                seed.
              </p>
            </Sub>
            <Sub title="B. Berkus (extended)">
              <p>
                Five drivers, each worth <F>score/100 × {formatUsd(BERKUS_CAP_PER_FACTOR_USD)}</F>:
                sound idea (market), prototype (product), quality team, strategic relationships
                (deal), rollout and sales (traction). Sum × region factor. Only when ARR is below
                $250k; half weight once there is any ARR.
              </p>
            </Sub>
            <Sub title="C. Risk-Factor Summation">
              <p>
                Start from the stage median × region factor. Twelve risks (management, stage,
                legislation, manufacturing, sales, funding, competition, technology, litigation,
                international, reputation, exit) are each rated −2 to +2 from the inputs. Every
                point is worth $250k at a $2.5M base and scales with the base. Applicable up to
                seed. The report lists each rating and why.
              </p>
            </Sub>
            <Sub title="D. VC Method">
              <p>
                Project revenue to the exit year:{" "}
                <F>max(ARR, non-recurring × 0.5) × (1 + g)^years</F>, where g is the annualised MoM
                growth (capped at 300%) or the stage default. Pre-revenue companies use{" "}
                <F>min(SOM × 10%, TAM × 0.5%)</F> as revenue at exit. Exit value = revenue × the
                sector exit multiple. Post-money today = exit value ÷ target return × (1 − dilution
                to exit); pre-money subtracts the current raise. Weight grows with revenue.
              </p>
            </Sub>
            <Sub title="E. Revenue Multiples">
              <p>
                Sector EV/ARR band, interpolated by growth quality (MoM growth 0 → 15% and NRR 90 →
                120%, blended 50/50), −20% if gross margin is below 50%, −25% if churn is above 20%.
                Valuation = ARR × multiple + non-recurring revenue × 1.0. Needs ARR ≥ $100k; weight
                rises from 0.1 at $100k to 0.45 at $1M+.
              </p>
            </Sub>
            <Sub title="F. Last-Round Anchor">
              <p>
                The last priced post-money stepped up by <F>(1 + annual step-up)^years</F> where the
                annual step-up is <F>0.25 + 0.5 × (traction − 50)/50</F>, floored at 0 (or −30% for
                a distressed company with under six months of runway and no growth). Applicable for
                36 months; weight 0.35 in the first year, 0.20 in the second, 0.10 after.
              </p>
            </Sub>
            <Sub title="G. Market-size cross-check">
              <p>
                Not a valuation, a sanity band: a company is rarely worth more than 3× the revenue
                it could plausibly capture, so the blended number is capped at <F>SOM × 3</F> and
                flagged. When TAM/SAM/SOM are missing the AI layer estimates them and the report
                says so.
              </p>
            </Sub>
          </div>
        </Section>

        <Section id="blend" title="Blending">
          <p>
            Each applicable method gets its stage preset weight × its weight hint, renormalised to
            sum to one. The blend is the weighted geometric mean, which resists a single outlier
            method better than an arithmetic average.
          </p>
          <Table
            head={["Stage", "Scorecard", "Berkus", "RFS", "VC", "Multiples", "Anchor"]}
            rows={STAGES.map((s) => [
              STAGE_LABELS[s],
              STAGE_WEIGHT_PRESETS[s].scorecard,
              STAGE_WEIGHT_PRESETS[s].berkus,
              STAGE_WEIGHT_PRESETS[s].rfs,
              STAGE_WEIGHT_PRESETS[s].vc,
              STAGE_WEIGHT_PRESETS[s].multiples,
              STAGE_WEIGHT_PRESETS[s].anchor,
            ])}
          />
          <p>
            Confidence = 100 − dispersion, where dispersion is the coefficient of variation across
            the method valuations (× 100, clamped). The range is ×0.70 to ×1.40 around the base,
            widened to ×0.55 / ×1.70 when confidence is below 50. When you are raising, the implied
            post-money is pre-money + the target raise.
          </p>
        </Section>

        <Section id="sensitivity" title="Sensitivity">
          <p>
            The engine is re-run with one variable perturbed at a time: ARR ±50%, one more paying
            customer, one more granted patent, one more operating country, MoM growth +5 points, HQ
            moved to the US, and twelve more months of runway. The report also offers live sliders
            that call the same engine.
          </p>
        </Section>

        <Section id="ai" title="The AI layer">
          <div className="grid gap-6 md:grid-cols-3">
            <Sub title="Qualitative scorer">
              <p>
                A sceptical European seed investor persona re-scores the seven factors from the full
                profile and narrative, with a one-sentence rationale each and a list of notable
                signals. Structured output only, no prose parsing. Large deviations from the formula
                are marked.
              </p>
            </Sub>
            <Sub title="Market estimator">
              <p>
                Runs only when TAM/SAM/SOM are missing. With web search enabled it cites public
                market reports; otherwise it estimates from knowledge with wide bands and a lower
                confidence. SOM is derived bottom-up (reachable customers × achievable contract
                value), never as a share of TAM.
              </p>
            </Sub>
            <Sub title="Memo and adjustment">
              <p>
                Strengths, risks, comparables, what moves the number, a recommended raise and a
                confidence score. The adjustment must stay within ±{AI_ADJUSTMENT_MAX_PCT}%; the
                server clamps it, recomputes the final number and records both. Without an API key
                the report still ships with the engine result.
              </p>
            </Sub>
          </div>
        </Section>

        <Section id="benchmarks" title="Benchmarks">
          <p>
            Version <F>{BENCHMARKS_META.version}</F>, as of {BENCHMARKS_META.asOf}.{" "}
            {BENCHMARKS_META.source} To update them, edit <F>src/lib/engine/benchmarks.ts</F>, bump
            the version and re-run the tests; every report carries the version it was computed with.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <Sub title="Stage medians and VC-method parameters">
              <Table
                head={[
                  "Stage",
                  "Median pre-money",
                  "Target return",
                  "Years to exit",
                  "Dilution to exit",
                ]}
                rows={STAGES.map((s) => [
                  STAGE_LABELS[s],
                  formatUsd(STAGE_MEDIAN_PRE_MONEY_USD[s]),
                  `${TARGET_ROI_BY_STAGE[s]}×`,
                  YEARS_TO_EXIT_BY_STAGE[s],
                  `${Math.round(DILUTION_TO_EXIT_BY_STAGE[s] * 100)}%`,
                ])}
              />
            </Sub>
            <Sub title="Region factors">
              <Table
                head={["Region", "Factor"]}
                rows={Object.entries(REGION_FACTOR).map(([k, v]) => [
                  REGION_LABELS[k] ?? k,
                  v.toFixed(2),
                ])}
              />
            </Sub>
            <Sub title="Sector multiples">
              <Table
                head={["Sector", "EV/ARR (base – high growth)", "Exit EV/Revenue"]}
                rows={Object.entries(SECTOR_ARR_MULTIPLE).map(([k, [lo, hi]]) => [
                  SECTOR_LABELS[k] ?? k,
                  `${lo}× – ${hi}×`,
                  `${SECTOR_EXIT_MULTIPLE_AT_SCALE[k as keyof typeof SECTOR_EXIT_MULTIPLE_AT_SCALE]}×`,
                ])}
              />
            </Sub>
          </div>
          <p className="text-sm text-muted-foreground">{DISCLAIMER}</p>
          <p>
            <Link href="/evaluate" className="underline underline-offset-4">
              Evaluate a startup
            </Link>
          </p>
        </Section>
      </div>
    </main>
  );
}
