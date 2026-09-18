import { AI_ADJUSTMENT_MAX_PCT } from "@/lib/engine/benchmarks";
import { clamp, round } from "@/lib/engine/helpers";
import type { EngineResult } from "@/lib/engine/types";
import type { StartupInput } from "@/lib/schema/startup";
import { getAiConfig, getClient } from "./client";
import { MEMO_SYSTEM, memoUserMessage } from "./prompts";
import { MEMO_TOOL, MemoOutput, type AiScoreResult, type MarketEstimate } from "./schemas";
import { toolInput } from "./score";

export interface MemoResult {
  memo: MemoOutput["memo"];
  disclaimer: string;
  adjustment: {
    requestedPct: number;
    appliedPct: number;
    clamped: boolean;
    rationale: string;
    /** What the model claimed; the server ignores it. */
    modelFinalPreMoneyUsd: number;
  };
  /** engine.preMoneyUsd × (1 + appliedPct/100), recomputed server-side. */
  finalPreMoneyUsd: number;
}

/** Clamp the requested adjustment into the bounded band and recompute the final number. */
export function applyAdjustment(enginePreMoneyUsd: number, requestedPct: number) {
  const appliedPct = round(clamp(requestedPct, -AI_ADJUSTMENT_MAX_PCT, AI_ADJUSTMENT_MAX_PCT), 2);
  return {
    appliedPct,
    clamped: appliedPct !== round(requestedPct, 2),
    finalPreMoneyUsd: round(enginePreMoneyUsd * (1 + appliedPct / 100)),
  };
}

/** 6.3 — investment memo plus a bounded, server-recomputed adjustment. */
export async function writeMemo(
  input: StartupInput,
  engine: EngineResult,
  aiScores: AiScoreResult | undefined,
  market: MarketEstimate | undefined,
): Promise<MemoResult> {
  const client = getClient();
  if (!client) throw new Error("AI unavailable: ANTHROPIC_API_KEY is not set.");
  const cfg = getAiConfig();

  const response = await client.messages.create({
    model: cfg.model,
    max_tokens: 8192,
    temperature: cfg.temperature,
    system: MEMO_SYSTEM,
    tools: [MEMO_TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: memoUserMessage(input, engine, aiScores, market) }],
  });

  const out = toolInput(response, MEMO_TOOL.name, (raw) => MemoOutput.parse(raw));
  const { appliedPct, clamped, finalPreMoneyUsd } = applyAdjustment(
    engine.preMoneyUsd,
    out.adjustmentPct,
  );
  return {
    memo: { ...out.memo, confidence: Math.round(clamp(out.memo.confidence, 0, 100)) },
    disclaimer: out.disclaimer,
    adjustment: {
      requestedPct: out.adjustmentPct,
      appliedPct,
      clamped,
      rationale: out.adjustmentRationale,
      modelFinalPreMoneyUsd: out.finalPreMoneyUsd,
    },
    finalPreMoneyUsd,
  };
}
