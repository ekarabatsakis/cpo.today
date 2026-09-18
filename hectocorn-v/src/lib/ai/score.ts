import type Anthropic from "@anthropic-ai/sdk";

import { clamp } from "@/lib/engine/helpers";
import { SCORE_KEYS, type Scores } from "@/lib/engine/types";
import type { StartupInput } from "@/lib/schema/startup";
import { getAiConfig, getClient } from "./client";
import { SCORER_SYSTEM, scorerUserMessage } from "./prompts";
import { AiScoreOutput, SCORE_TOOL, type AiScoreResult } from "./schemas";

export const LARGE_DEVIATION_PTS = 20;

/** Extract and validate the tool input for `toolName` from a response. */
export function toolInput<T>(
  response: Anthropic.Message,
  toolName: string,
  parse: (raw: unknown) => T,
): T {
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }
  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === toolName,
  );
  if (!block) {
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .slice(0, 200);
    throw new Error(`The model did not call ${toolName}${text ? `: ${text}` : ""}.`);
  }
  return parse(block.input);
}

/** 6.1 — qualitative scoring with a strict tool schema. */
export async function scoreQualitative(
  input: StartupInput,
  deterministic: Scores,
): Promise<AiScoreResult> {
  const client = getClient();
  if (!client) throw new Error("AI unavailable: ANTHROPIC_API_KEY is not set.");
  const cfg = getAiConfig();

  const response = await client.messages.create({
    model: cfg.model,
    max_tokens: 4096,
    temperature: cfg.temperature,
    system: SCORER_SYSTEM,
    tools: [SCORE_TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: scorerUserMessage(input, deterministic) }],
  });

  const out = toolInput(response, SCORE_TOOL.name, (raw) => AiScoreOutput.parse(raw));
  const scores = {} as Scores;
  const rationale = {} as Record<keyof Scores, string>;
  const largeDeviations: string[] = [];
  for (const k of SCORE_KEYS) {
    scores[k] = Math.round(clamp(out[k].score, 0, 100));
    rationale[k] = out[k].rationale;
    if (Math.abs(scores[k] - deterministic[k]) > LARGE_DEVIATION_PTS) largeDeviations.push(k);
  }
  return { scores, rationale, notableSignals: out.notableSignals, largeDeviations };
}
