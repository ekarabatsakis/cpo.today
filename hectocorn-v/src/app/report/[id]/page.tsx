import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuditCard } from "@/components/report/AuditCard";
import { MarketCard } from "@/components/report/MarketCard";
import { MemoSection } from "@/components/report/MemoSection";
import { MethodBreakdown } from "@/components/report/MethodBreakdown";
import { ProcessingState } from "@/components/report/ProcessingState";
import { RangeBar } from "@/components/report/RangeBar";
import { ScoreRadar } from "@/components/report/ScoreRadar";
import { SensitivityPanel } from "@/components/report/SensitivityPanel";
import { ShareBar } from "@/components/report/ShareBar";
import { ValuationHeadline } from "@/components/report/ValuationHeadline";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { runSensitivity } from "@/lib/engine";
import { BUSINESS_MODEL_LABELS, REGION_LABELS, SECTOR_LABELS } from "@/lib/schema/labels";
import { formatUsd } from "@/lib/utils";
import { parseReport } from "@/types/report";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const row = await prisma.report.findUnique({
    where: { id },
    select: { name: true, finalPreMoneyUsd: true },
  });
  if (!row) return { title: "Report not found" };
  return {
    title: `${row.name} valuation`,
    description: row.finalPreMoneyUsd
      ? `Indicative pre-money valuation: ${formatUsd(row.finalPreMoneyUsd)}`
      : undefined,
    robots: { index: false },
  };
}

export default async function ReportPage({ params }: Params) {
  const { id } = await params;
  const row = await prisma.report.findUnique({ where: { id } });
  if (!row) notFound();
  const report = parseReport(row);
  const engine = report.effectiveEngine;
  const input = report.inputUsd;
  const sensitivity = engine
    ? runSensitivity(input, engine, {
        asOf: new Date(engine.asOf),
        scores: engine.scoresSource === "ai" ? engine.scores : undefined,
        scoresSource: engine.scoresSource,
      })
    : [];

  return (
    <main className="px-4 py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{SECTOR_LABELS[input.sector] ?? input.sector}</Badge>
              <span>{BUSINESS_MODEL_LABELS[input.businessModel] ?? input.businessModel}</span>
              <span>·</span>
              <span>
                {input.hqCountry} ({REGION_LABELS[input.hqRegion] ?? input.hqRegion})
              </span>
              <span>·</span>
              <span>
                {new Date(report.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <h1
              className="text-4xl font-bold text-foreground md:text-5xl"
              data-testid="report-name"
            >
              {report.name}
            </h1>
            <p className="max-w-3xl text-base text-muted-foreground">{input.oneLiner}</p>
          </div>
          <ShareBar id={report.id} />
        </header>

        {report.status !== "done" && report.status !== "error" ? (
          <ProcessingState id={report.id} initialMessage={report.statusMessage ?? "Working…"} />
        ) : null}

        {engine ? (
          <>
            <ValuationHeadline report={report} />
            <RangeBar report={report} />
            <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
              <MethodBreakdown engine={engine} />
              <ScoreRadar deterministic={engine.deterministicScores} ai={report.aiResult?.scores} />
            </div>
            <MemoSection report={report} />
            <div className="grid gap-6 lg:grid-cols-2">
              <MarketCard report={report} />
              <AuditCard report={report} />
            </div>
            <SensitivityPanel
              reportId={report.id}
              input={input}
              basePreMoneyUsd={engine.preMoneyUsd}
              scenarios={sensitivity}
            />
          </>
        ) : (
          <p className="text-muted-foreground">
            This report has no engine result{report.error ? `: ${report.error}` : "."}
          </p>
        )}
      </div>
    </main>
  );
}
