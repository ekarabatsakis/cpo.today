/**
 * Seeds the PlugSecure example report (deterministic engine only, no AI call)
 * so a fresh clone has a report to open at /report/seed-plugsecure-01.
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

import { BENCHMARKS_VERSION, runEngine, toUsd } from "../src/lib/engine";
import { plugSecure } from "../src/lib/schema/examples";

export const SEED_REPORT_ID = "seed-plugsecure-01";

const prisma = new PrismaClient();

async function main() {
  const inputRaw = plugSecure();
  const inputUsd = toUsd(inputRaw);
  const engine = runEngine(inputUsd, { asOf: new Date("2026-09-18T00:00:00Z") });
  const data = {
    name: inputRaw.name,
    stage: engine.stage,
    status: "done",
    statusMessage: "Done",
    aiStatus: "unavailable",
    inputRaw: JSON.stringify(inputRaw),
    inputUsd: JSON.stringify(inputUsd),
    engineResult: JSON.stringify(engine),
    engineResultAi: null,
    aiResult: null,
    finalPreMoneyUsd: engine.preMoneyUsd,
    adjustmentPct: 0,
    model: null,
    promptVersion: null,
    benchmarksVersion: BENCHMARKS_VERSION,
    timings: JSON.stringify({ engineMs: 0, totalMs: 0 }),
    error: null,
  };
  await prisma.report.upsert({
    where: { id: SEED_REPORT_ID },
    create: { id: SEED_REPORT_ID, ...data },
    update: data,
  });
  console.log(
    `Seeded ${inputRaw.name}: stage ${engine.stage}, pre-money $${engine.preMoneyUsd.toLocaleString("en-US")} → /report/${SEED_REPORT_ID}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
