import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/report/[id]/status — lightweight progress for the wizard's loading state. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.report.findUnique({
    where: { id },
    select: {
      status: true,
      statusMessage: true,
      aiStatus: true,
      stage: true,
      finalPreMoneyUsd: true,
    },
  });
  if (!row) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  return NextResponse.json(row, { headers: { "cache-control": "no-store" } });
}
