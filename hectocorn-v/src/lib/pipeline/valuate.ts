import { nanoid } from "nanoid";

import {
  describeError,
  estimateMarket,
  getAiConfig,
  needsMarketEstimate,
  PROMPT_VERSION,
  scoreQualitative,
  writeMemo,
  type AiScoreResult,
  type MarketEstimate,
  type MemoResult,
} from "@/lib/ai";
import { prisma } from "@/lib/db";
import { BENCHMARKS_VERSION, runEngine, toUsd, type EngineResult } from "@/lib/engine";
import { StartupInput } from "@/lib/schema/startup";
import type { AiResult, AiStageError, ReportStatus, Timings } from "@/types/report";

const STATUS_MESSAGES: Record<ReportStatus, string> = {
  pending: "Queued…",
  engine: "Running the deterministic engine…",
  scoring: "Scoring team, market, product and moat…",
  market: "Estimating market size…",
  memo: "Writing the investment memo…",
  done: "Done",
  error: "Something went wrong",
};

export interface StartResult {
  id: string;
  engine: EngineResult;
}

/**
 * Phase 1 of the pipeline (synchronous): validate → normalise FX → engine →
 * persist the row. Returns immediately so the client can start polling.
 */
export async function startValuation(raw: unknown): Promise<StartResult> {
  const t0 = Date.now();
  const inputRaw = StartupInput.parse(raw);
  const inputUsd = toUsd(inputRaw);
  const validateMs = Date.now() - t0;

  const t1 = Date.now();
  const engine = runEngine(inputUsd);
  const engineMs = Date.now() - t1;

  const ai = getAiConfig();
  const id = nanoid(16);
  const timings: Timings = { validateMs, engineMs };
  await prisma.report.create({
    data: {
      id,
      name: inputRaw.name,
      stage: engine.stage,
      status: ai.enabled ? "scoring" : "done",
      statusMessage: ai.enabled ? STATUS_MESSAGES.scoring : STATUS_MESSAGES.done,
      aiStatus: ai.enabled ? "pending" : "unavailable",
      inputRaw: JSON.stringify(inputRaw),
      inputUsd: JSON.stringify(inputUsd),
      engineResult: JSON.stringify(engine),
      finalPreMoneyUsd: engine.preMoneyUsd,
      adjustmentPct: 0,
      model: ai.enabled ? ai.model : null,
      promptVersion: ai.enabled ? PROMPT_VERSION : null,
      benchmarksVersion: BENCHMARKS_VERSION,
      timings: JSON.stringify({ ...timings, totalMs: Date.now() - t0 }),
    },
  });
  return { id, engine };
}

async function setStatus(id: string, status: ReportStatus, extra: Record<string, unknown> = {}) {
  await prisma.report.update({
    where: { id },
    data: { status, statusMessage: STATUS_MESSAGES[status], ...extra },
  });
}

/**
 * Phase 2 (background): AI scorer + market estimator in parallel → engine
 * re-run with AI scores and market → memo → clamp → persist. Never throws:
 * every failure is recorded and the deterministic result stands (§6.4).
 */
export async function completeValuation(id: string): Promise<void> {
  const row = await prisma.report.findUnique({ where: { id } });
  if (!row || !row.engineResult) return;
  const ai = getAiConfig();
  if (!ai.enabled) {
    await setStatus(id, "done", { aiStatus: "unavailable" });
    return;
  }

  const t0 = Date.now();
  const inputUsd = JSON.parse(row.inputUsd) as StartupInput;
  const engine = JSON.parse(row.engineResult) as EngineResult;
  const timings: Timings = JSON.parse(row.timings ?? "{}") as Timings;
  const errors: AiStageError[] = [];
  const result: AiResult = { promptVersion: PROMPT_VERSION, model: ai.model, errors };

  try {
    await setStatus(id, "scoring");
    const needMarket = needsMarketEstimate(inputUsd);
    const tScore = Date.now();
    const [scoresSettled, marketSettled] = await Promise.allSettled([
      scoreQualitative(inputUsd, engine.deterministicScores),
      needMarket
        ? withStatus(id, "market", () => estimateMarket(inputUsd))
        : Promise.resolve(undefined),
    ]);
    timings.scoreMs = Date.now() - tScore;
    timings.marketMs = needMarket ? Date.now() - tScore : 0;

    let aiScores: AiScoreResult | undefined;
    if (scoresSettled.status === "fulfilled") {
      aiScores = scoresSettled.value;
      result.scores = aiScores;
    } else errors.push({ stage: "score", message: describeError(scoresSettled.reason) });

    let market: MarketEstimate | undefined;
    if (marketSettled.status === "fulfilled") {
      market = marketSettled.value;
      if (market) result.market = market;
    } else errors.push({ stage: "market", message: describeError(marketSettled.reason) });

    // Re-run the engine with the AI scores and/or the estimated market.
    let engineAi: EngineResult | undefined;
    if (aiScores || market) {
      const t = Date.now();
      const input = structuredClone(inputUsd);
      if (market) {
        input.market = {
          ...input.market,
          tamUsd: input.market.tamUsd ?? market.tamUsd,
          samUsd: input.market.samUsd ?? market.samUsd,
          somUsd: input.market.somUsd ?? market.somUsd,
          marketCagrPct: input.market.marketCagrPct ?? market.cagrPct,
          hasEstimateFromAi: true,
        };
      }
      engineAi = runEngine(input, {
        asOf: new Date(engine.asOf),
        scores: aiScores?.scores,
        scoresSource: aiScores ? "ai" : undefined,
      });
      timings.engineRerunMs = Date.now() - t;
      await prisma.report.update({
        where: { id },
        data: {
          engineResultAi: JSON.stringify(engineAi),
          stage: engineAi.stage,
          finalPreMoneyUsd: engineAi.preMoneyUsd,
        },
      });
    }
    const effective = engineAi ?? engine;

    await setStatus(id, "memo");
    const tMemo = Date.now();
    let memo: MemoResult | undefined;
    try {
      memo = await writeMemo(inputUsd, effective, aiScores, market);
      result.memo = memo;
    } catch (e) {
      errors.push({ stage: "memo", message: describeError(e) });
    }
    timings.memoMs = Date.now() - tMemo;

    const finalPreMoneyUsd = memo ? memo.finalPreMoneyUsd : effective.preMoneyUsd;
    const adjustmentPct = memo ? memo.adjustment.appliedPct : 0;
    const aiStatus =
      errors.length === 0
        ? "ok"
        : errors.length === 3 || (!aiScores && !memo)
          ? "unavailable"
          : "partial";
    timings.totalMs = (timings.totalMs ?? 0) + (Date.now() - t0);

    await prisma.report.update({
      where: { id },
      data: {
        status: "done",
        statusMessage: STATUS_MESSAGES.done,
        aiStatus,
        aiResult: JSON.stringify(result),
        finalPreMoneyUsd,
        adjustmentPct,
        timings: JSON.stringify(timings),
      },
    });
  } catch (e) {
    // Belt and braces: the deterministic result is already persisted.
    errors.push({ stage: "memo", message: describeError(e) });
    await prisma.report.update({
      where: { id },
      data: {
        status: "done",
        statusMessage: STATUS_MESSAGES.done,
        aiStatus: "unavailable",
        aiResult: JSON.stringify(result),
        error: describeError(e),
      },
    });
  }
}

async function withStatus<T>(id: string, status: ReportStatus, fn: () => Promise<T>): Promise<T> {
  await setStatus(id, status).catch(() => undefined);
  return fn();
}
