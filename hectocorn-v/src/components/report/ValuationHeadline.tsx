import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS } from "@/lib/schema/labels";
import { formatUsd } from "@/lib/utils";
import type { ReportPayload } from "@/types/report";

function ConfidenceRing({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3" aria-label={`Confidence ${pct} out of 100`}>
      <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-hidden="true">
        <circle cx="42" cy="42" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform="rotate(-90 42 42)"
        />
        <text x="42" y="47" textAnchor="middle" className="fill-foreground text-lg font-semibold">
          {pct}
        </text>
      </svg>
      <div className="text-sm">
        <div className="font-medium">Confidence</div>
        <div className="text-muted-foreground">100 − method dispersion</div>
      </div>
    </div>
  );
}

export function ValuationHeadline({ report }: { report: ReportPayload }) {
  const engine = report.effectiveEngine;
  if (!engine) return null;
  const final = report.finalPreMoneyUsd ?? engine.preMoneyUsd;
  const adj = report.adjustmentPct ?? 0;
  const hasAi = Boolean(report.aiResult?.memo);
  const lowUsd = Math.round(final * (engine.lowUsd / engine.preMoneyUsd));
  const highUsd = Math.round(final * (engine.highUsd / engine.preMoneyUsd));
  const raise = report.inputUsd.funding.currentlyRaising
    ? report.inputUsd.funding.targetRaiseUsd
    : undefined;

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm md:p-8" aria-labelledby="headline">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{STAGE_LABELS[engine.stage] ?? engine.stage}</Badge>
            <span className="text-sm text-muted-foreground">{engine.stageReason}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Pre-money valuation</p>
            <p
              id="headline"
              className="text-5xl font-bold leading-tight md:text-7xl"
              data-testid="headline-number"
            >
              {formatUsd(final)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatUsd(final, { compact: false })} · range {formatUsd(lowUsd)} –{" "}
              {formatUsd(highUsd)}
              {raise
                ? ` · implied post-money ${formatUsd(final + raise)} after a ${formatUsd(raise)} raise`
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="valuation-trail">
            <span className="rounded-md bg-secondary px-3 py-1.5">
              <span className="text-muted-foreground">Engine </span>
              <span className="font-semibold">{formatUsd(engine.preMoneyUsd)}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="rounded-md bg-secondary px-3 py-1.5">
              <span className="text-muted-foreground">AI adjustment </span>
              <span className="font-semibold">
                {hasAi ? `${adj > 0 ? "+" : ""}${adj}%` : "none"}
              </span>
              {report.aiResult?.memo?.adjustment.clamped ? (
                <span className="ml-1 text-xs text-muted-foreground">(clamped to ±25%)</span>
              ) : null}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
              <span className="opacity-80">Final </span>
              <span className="font-semibold">{formatUsd(final)}</span>
            </span>
          </div>
          {report.engineResult && report.engineResultAi ? (
            <p className="text-xs text-muted-foreground">
              Deterministic scores alone gave {formatUsd(report.engineResult.preMoneyUsd)}; with the
              AI scores
              {report.engineResultAi.flags.includes("market_size_estimated_by_ai")
                ? " and the estimated market"
                : ""}{" "}
              the engine gives {formatUsd(report.engineResultAi.preMoneyUsd)}.
            </p>
          ) : null}
        </div>
        <ConfidenceRing value={engine.confidence} />
      </div>
    </section>
  );
}
