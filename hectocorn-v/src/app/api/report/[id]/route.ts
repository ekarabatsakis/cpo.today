import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { runSensitivity } from "@/lib/engine";
import { parseReport } from "@/types/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/report/[id] — the full report payload (input, engine results, AI results, sensitivity). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.report.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const report = parseReport(row);
  if (report.effectiveEngine) {
    report.sensitivity = runSensitivity(report.inputUsd, report.effectiveEngine, {
      asOf: new Date(report.effectiveEngine.asOf),
      scores:
        report.effectiveEngine.scoresSource === "ai" ? report.effectiveEngine.scores : undefined,
      scoresSource: report.effectiveEngine.scoresSource,
    });
  }
  return NextResponse.json(report);
}
