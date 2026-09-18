"use client";

import { Loader2, Play } from "lucide-react";
import { useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BUSINESS_MODEL_LABELS,
  CURRENCY_SYMBOL,
  LEVEL_LABELS,
  PRODUCT_STAGE_LABELS,
  REGION_LABELS,
  ROUND_TYPE_LABELS,
  SECTOR_LABELS,
  STAGE_LABELS,
} from "@/lib/schema/labels";
import type { FormValues, WizardForm } from "./types";

export interface RunState {
  phase: "idle" | "submitting" | "processing" | "error";
  message?: string;
  progress?: number;
  error?: string;
}

export function StepReview({
  form,
  run,
  onRun,
}: {
  form: WizardForm;
  run: RunState;
  onRun: () => void;
}) {
  const v = useWatch({ control: form.control }) as FormValues;
  const cur = CURRENCY_SYMBOL[v.reportingCurrency ?? "USD"];
  const money = (n: number | undefined) =>
    n === undefined ? "—" : `${cur}${Math.round(n).toLocaleString("en-US")}`;
  const pct = (n: number | undefined) => (n === undefined ? "—" : `${n}%`);
  const list = (a: string[] | undefined) => (a && a.length ? a.join(", ") : "—");
  const yesNo = (b: boolean | undefined) => (b ? "Yes" : "No");
  const busy = run.phase === "submitting" || run.phase === "processing";

  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: "Company",
      rows: [
        ["Name", v.name || "—"],
        ["One-liner", v.oneLiner || "—"],
        ["Sector", `${SECTOR_LABELS[v.sector] ?? "—"}${v.subSector ? ` · ${v.subSector}` : ""}`],
        ["Business model", BUSINESS_MODEL_LABELS[v.businessModel] ?? "—"],
        ["Founded", v.foundedDate || "—"],
        ["HQ", `${v.hqCountry || "—"} (${REGION_LABELS[v.hqRegion] ?? "—"})`],
        ["Operating countries", list(v.operatingCountries)],
      ],
    },
    {
      title: "Team",
      rows: [
        ["Full-time employees", String(v.team?.fullTimeEmployees ?? "—")],
        [
          "Founders",
          `${v.team?.founders ?? "—"} (${v.team?.foundersWithPriorExit ?? 0} with a prior exit)`,
        ],
        ["Domain experience", `${v.team?.foundersWithDomainYears ?? "—"} yrs`],
        ["Technical co-founder", yesNo(v.team?.technicalCofounder)],
        ["Notable advisors", String(v.team?.advisorsNotable ?? 0)],
      ],
    },
    {
      title: "Traction & financials",
      rows: [
        [
          "Paying customers",
          `${v.traction?.payingCustomers ?? "—"} (${v.traction?.pilotsOrLOIs ?? 0} pilots/LOIs)`,
        ],
        ["ARR", money(v.traction?.arrUsd ?? 0)],
        ["Non-recurring revenue (TTM)", money(v.traction?.nonRecurringRevenueTtmUsd ?? 0)],
        [
          "MoM growth / NRR",
          `${pct(v.traction?.momGrowthPct)} / ${pct(v.traction?.netRevenueRetentionPct)}`,
        ],
        [
          "Gross margin / churn",
          `${pct(v.traction?.grossMarginPct)} / ${pct(v.traction?.churnAnnualPct)}`,
        ],
        ["Marquee customers", list(v.traction?.marqueeCustomers)],
        [
          "Monthly burn / cash",
          `${money(v.financials?.monthlyBurnUsd)} / ${money(v.financials?.cashOnHandUsd)}`,
        ],
        ["Profitable", yesNo(v.financials?.isProfitable)],
      ],
    },
    {
      title: "Funding",
      rows: [
        [
          "Rounds",
          v.funding?.rounds?.length
            ? v.funding.rounds
                .map(
                  (r) =>
                    `${ROUND_TYPE_LABELS[r.type] ?? r.type} ${r.date}: ${money(r.amountUsd)}${
                      r.postMoneyUsd ? ` at ${money(r.postMoneyUsd)} post` : ""
                    }`,
                )
                .join(" · ")
            : "—",
        ],
        ["Total raised", money(v.funding?.totalRaisedUsd ?? 0)],
        [
          "Currently raising",
          v.funding?.currentlyRaising ? money(v.funding?.targetRaiseUsd) : "No",
        ],
      ],
    },
    {
      title: "IP & product",
      rows: [
        ["Product stage", PRODUCT_STAGE_LABELS[v.ip?.productStage ?? ""] ?? "—"],
        ["Tech defensibility", LEVEL_LABELS[v.ip?.techDefensibility ?? ""] ?? "—"],
        ["Patents", `${v.ip?.patentsGranted ?? 0} granted, ${v.ip?.patentsPending ?? 0} pending`],
        [
          "Proprietary data / trademarks",
          `${yesNo(v.ip?.proprietaryData)} / ${yesNo(v.ip?.trademarksRegistered)}`,
        ],
        ["Regulatory tailwind", yesNo(v.ip?.regulatoryTailwind)],
        ["Certifications", list(v.ip?.certifications)],
      ],
    },
    {
      title: "Market & risks",
      rows: [
        [
          "TAM / SAM / SOM",
          `${money(v.market?.tamUsd)} / ${money(v.market?.samUsd)} / ${money(v.market?.somUsd)}`,
        ],
        ["Market CAGR", pct(v.market?.marketCagrPct)],
        ["Competitive intensity", LEVEL_LABELS[v.market?.competitiveIntensity ?? ""] ?? "—"],
        [
          "Risk flags",
          [
            v.risks?.keyPersonDependency && "key person",
            v.risks?.litigationOrRegulatoryRisk && "litigation/regulatory",
            v.risks?.hardwareSupplyRisk && "hardware supply",
          ]
            .filter(Boolean)
            .join(", ") || "none",
        ],
        ["Self-declared stage", STAGE_LABELS[v.selfDeclaredStage ?? ""] ?? "—"],
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-[-0.5px]">Review</h2>
        <p className="text-sm text-muted-foreground">
          Check the inputs, then run the valuation. Amounts are in {v.reportingCurrency ?? "USD"}{" "}
          and are converted to USD server-side.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((s) => (
          <div key={s.title} className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3 text-sm font-medium">{s.title}</div>
            <table className="w-full text-sm">
              <tbody>
                {s.rows.map(([k, val]) => (
                  <tr key={k} className="border-b last:border-0">
                    <th
                      scope="row"
                      className="w-2/5 px-4 py-2 text-left align-top font-normal text-muted-foreground"
                    >
                      {k}
                    </th>
                    <td className="px-4 py-2 align-top">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-6">
        {busy ? (
          <div className="space-y-4" aria-live="polite">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-base font-medium">{run.message ?? "Running valuation…"}</p>
            </div>
            <Progress value={run.progress ?? 10} />
            <p className="text-sm text-muted-foreground">
              The deterministic engine finishes instantly. The AI scoring, market estimate and memo
              take up to a minute. Without an API key the report opens with the engine result only.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-medium">Ready to value {v.name || "this startup"}</p>
              <p className="text-sm text-muted-foreground">
                Engine first, then Claude scores, estimates the market if needed and writes the
                memo.
              </p>
              {run.phase === "error" ? (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {run.error}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="lg"
              className="h-11 px-8"
              onClick={onRun}
              data-testid="run-valuation"
            >
              <Play className="h-4 w-4" /> Run valuation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
