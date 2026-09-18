import type { Report } from "@prisma/client";

import type { AiScoreResult, MarketEstimate } from "@/lib/ai/schemas";
import type { MemoResult } from "@/lib/ai/memo";
import type { EngineResult, SensitivityScenario } from "@/lib/engine/types";
import type { StartupInput } from "@/lib/schema/startup";

export type ReportStatus = "pending" | "engine" | "scoring" | "market" | "memo" | "done" | "error";
export type AiStatus = "pending" | "ok" | "partial" | "unavailable";

export interface AiStageError {
  stage: "score" | "market" | "memo";
  message: string;
}

/** Everything the AI layer produced, persisted as JSON on the row. */
export interface AiResult {
  promptVersion: string;
  model: string;
  scores?: AiScoreResult;
  market?: MarketEstimate;
  memo?: MemoResult;
  errors: AiStageError[];
}

export interface Timings {
  validateMs?: number;
  engineMs?: number;
  scoreMs?: number;
  marketMs?: number;
  engineRerunMs?: number;
  memoMs?: number;
  totalMs?: number;
}

/** A report row with its JSON columns parsed. */
export interface ReportPayload {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  stage: string | null;
  status: ReportStatus;
  statusMessage: string | null;
  aiStatus: AiStatus;
  inputRaw: StartupInput;
  inputUsd: StartupInput;
  engineResult: EngineResult | null;
  engineResultAi: EngineResult | null;
  aiResult: AiResult | null;
  finalPreMoneyUsd: number | null;
  adjustmentPct: number | null;
  model: string | null;
  promptVersion: string | null;
  benchmarksVersion: string | null;
  timings: Timings | null;
  error: string | null;
  /** Computed for the page: the engine result the final number is based on. */
  effectiveEngine: EngineResult | null;
  sensitivity?: SensitivityScenario[];
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function parseReport(row: Report): ReportPayload {
  const engineResult = parseJson<EngineResult>(row.engineResult);
  const engineResultAi = parseJson<EngineResult>(row.engineResultAi);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    name: row.name,
    stage: row.stage,
    status: row.status as ReportStatus,
    statusMessage: row.statusMessage,
    aiStatus: row.aiStatus as AiStatus,
    inputRaw: JSON.parse(row.inputRaw) as StartupInput,
    inputUsd: JSON.parse(row.inputUsd) as StartupInput,
    engineResult,
    engineResultAi,
    aiResult: parseJson<AiResult>(row.aiResult),
    finalPreMoneyUsd: row.finalPreMoneyUsd,
    adjustmentPct: row.adjustmentPct,
    model: row.model,
    promptVersion: row.promptVersion,
    benchmarksVersion: row.benchmarksVersion,
    timings: parseJson<Timings>(row.timings),
    error: row.error,
    effectiveEngine: engineResultAi ?? engineResult,
  };
}
