import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { applyWhatIf, runEngine, toUsd, type EngineOptions, type EngineResult } from "@/lib/engine";
import { Region } from "@/lib/schema/startup";
import { StartupInput } from "@/lib/schema/startup";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseReport } from "@/types/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WhatIfSchema = z.object({
  arrUsd: z.number().min(0).optional(),
  payingCustomers: z.number().int().min(0).optional(),
  patentsGranted: z.number().int().min(0).optional(),
  operatingCountriesCount: z.number().int().min(0).optional(),
  momGrowthPct: z.number().min(-100).max(500).optional(),
  hqRegion: Region.optional(),
  runwayMonths: z.number().min(0).max(240).optional(),
  targetRaiseUsd: z.number().min(0).optional(),
  tamUsd: z.number().min(0).optional(),
  somUsd: z.number().min(0).optional(),
});

const Body = z.object({
  reportId: z.string().optional(),
  input: z.unknown().optional(),
  whatIf: WhatIfSchema.default({}),
});

/**
 * POST /api/sensitivity — custom what-ifs. Pass a `reportId` (the stored USD
 * input and AI scores are reused) or a raw `input` in its reporting currency.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`sensitivity:${clientIp(req)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  const { reportId, input, whatIf } = parsed.data;

  let base: EngineResult;
  let inputUsd: StartupInput;
  let options: EngineOptions = {};
  if (reportId) {
    const row = await prisma.report.findUnique({ where: { id: reportId } });
    if (!row) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    const report = parseReport(row);
    if (!report.effectiveEngine)
      return NextResponse.json({ error: "Report has no result." }, { status: 409 });
    base = report.effectiveEngine;
    inputUsd = report.inputUsd;
    options = {
      asOf: new Date(base.asOf),
      scores: base.scoresSource === "ai" ? base.scores : undefined,
      scoresSource: base.scoresSource,
    };
  } else {
    const p = StartupInput.safeParse(input);
    if (!p.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    inputUsd = toUsd(p.data);
    base = runEngine(inputUsd, options);
  }

  const result = runEngine(applyWhatIf(inputUsd, whatIf), options);
  return NextResponse.json({
    base: {
      preMoneyUsd: base.preMoneyUsd,
      lowUsd: base.lowUsd,
      highUsd: base.highUsd,
      stage: base.stage,
    },
    result: {
      preMoneyUsd: result.preMoneyUsd,
      lowUsd: result.lowUsd,
      highUsd: result.highUsd,
      stage: result.stage,
      confidence: result.confidence,
      flags: result.flags,
      weights: result.weights,
      methods: result.methods.map((m) => ({
        key: m.key,
        name: m.name,
        valuationUsd: m.valuationUsd,
        applicable: m.applicable,
      })),
    },
    deltaUsd: result.preMoneyUsd - base.preMoneyUsd,
    deltaPct:
      base.preMoneyUsd > 0 ? ((result.preMoneyUsd - base.preMoneyUsd) / base.preMoneyUsd) * 100 : 0,
  });
}
