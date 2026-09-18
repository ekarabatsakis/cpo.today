import { NextResponse, after } from "next/server";
import { ZodError } from "zod";

import { completeValuation, startValuation } from "@/lib/pipeline/valuate";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/valuate — validate → normalise FX → engine → persist → { id }.
 * The AI stages run after the response is sent; poll /api/report/[id]/status.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`valuate:${clientIp(req)}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const { id, engine } = await startValuation(body);
    after(() => completeValuation(id));
    return NextResponse.json(
      { id, stage: engine.stage, preMoneyUsd: engine.preMoneyUsd },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed.",
          issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 },
      );
    }
    console.error("valuate failed", e);
    return NextResponse.json({ error: "The valuation could not be started." }, { status: 500 });
  }
}
