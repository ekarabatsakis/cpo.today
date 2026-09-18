import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import { SCORE_KEYS, type Scores } from "@/lib/engine/types";

/* ---------- 6.1 Qualitative scorer ---------- */

const score = z.number().min(0).max(100);
const ScoreEntry = z.object({ score, rationale: z.string().min(1).max(400) });

export const AiScoreOutput = z.object({
  team: ScoreEntry,
  market: ScoreEntry,
  product: ScoreEntry,
  traction: ScoreEntry,
  moat: ScoreEntry,
  financial: ScoreEntry,
  deal: ScoreEntry,
  notableSignals: z.array(z.string().max(300)).max(12),
});
export type AiScoreOutput = z.infer<typeof AiScoreOutput>;

export interface AiScoreResult {
  scores: Scores;
  rationale: Record<keyof Scores, string>;
  notableSignals: string[];
  /** Keys where |AI − deterministic| > 20. */
  largeDeviations: string[];
}

const scoreEntrySchema = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    rationale: { type: "string", description: "One sentence." },
  },
  required: ["score", "rationale"],
  additionalProperties: false,
} as const;

export const SCORE_TOOL: Anthropic.Tool = {
  name: "submit_scores",
  description:
    "Submit the seven qualitative scores (0–100) with a one-sentence rationale each, plus notable signals.",
  strict: true,
  input_schema: {
    type: "object",
    properties: Object.fromEntries([
      ...SCORE_KEYS.map((k) => [k, scoreEntrySchema]),
      [
        "notableSignals",
        {
          type: "array",
          items: { type: "string" },
          description:
            "Short list of the signals that most moved your assessment, positive or negative.",
        },
      ],
    ]),
    required: [...SCORE_KEYS, "notableSignals"],
    additionalProperties: false,
  },
};

/* ---------- 6.2 Market estimator ---------- */

export const MarketEstimate = z.object({
  tamUsd: z.number().positive(),
  samUsd: z.number().positive(),
  somUsd: z.number().positive(),
  cagrPct: z.number().min(-50).max(200),
  method: z.string().min(1).max(2000),
  sources: z
    .array(z.object({ title: z.string().max(300), url: z.string().max(1000).optional() }))
    .max(20),
  confidence: z.number().min(0).max(100),
});
export type MarketEstimate = z.infer<typeof MarketEstimate>;

export const MARKET_TOOL: Anthropic.Tool = {
  name: "submit_market_estimate",
  description:
    "Submit the TAM/SAM/SOM estimate in USD (annual), the market CAGR, the derivation, sources and confidence.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      tamUsd: { type: "number", description: "Total addressable market, USD per year." },
      samUsd: { type: "number", description: "Serviceable addressable market, USD per year." },
      somUsd: {
        type: "number",
        description:
          "Serviceable obtainable market, USD per year, derived bottom-up: reachable customers × achievable ACV in 5 years.",
      },
      cagrPct: { type: "number", description: "Expected market growth, % per year." },
      method: {
        type: "string",
        description: "How each number was derived, including the bottom-up SOM arithmetic.",
      },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: ["string", "null"] },
          },
          required: ["title", "url"],
          additionalProperties: false,
        },
      },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
    },
    required: ["tamUsd", "samUsd", "somUsd", "cagrPct", "method", "sources", "confidence"],
    additionalProperties: false,
  },
};

/* ---------- 6.3 Memo + bounded adjustment ---------- */

export const MemoOutput = z.object({
  adjustmentPct: z.number(),
  adjustmentRationale: z.string().min(1).max(2000),
  finalPreMoneyUsd: z.number(),
  memo: z.object({
    summary: z.string().min(1).max(3000),
    strengths: z.array(z.string().max(500)).max(10),
    risks: z.array(z.string().max(500)).max(10),
    comparables: z
      .array(
        z.object({
          name: z.string().max(200),
          whyRelevant: z.string().max(500),
          indicativeValuation: z.string().max(200).nullable(),
        }),
      )
      .max(8),
    whatMovesTheNumber: z
      .array(z.object({ lever: z.string().max(300), estimatedImpactPct: z.number() }))
      .max(10),
    recommendedRaise: z
      .object({ amountUsd: z.number().nonnegative(), rationale: z.string().max(600) })
      .nullable(),
    confidence: z.number().min(0).max(100),
  }),
  disclaimer: z.string().max(1000),
});
export type MemoOutput = z.infer<typeof MemoOutput>;

export const MEMO_TOOL: Anthropic.Tool = {
  name: "submit_memo",
  description:
    "Submit the investment memo and the bounded adjustment to the engine's pre-money valuation.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      adjustmentPct: {
        type: "number",
        description: "Percentage adjustment to the engine pre-money, between -25 and 25.",
      },
      adjustmentRationale: { type: "string" },
      finalPreMoneyUsd: {
        type: "number",
        description: "engine pre-money × (1 + adjustmentPct/100). The server recomputes this.",
      },
      memo: {
        type: "object",
        properties: {
          summary: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          risks: { type: "array", items: { type: "string" } },
          comparables: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                whyRelevant: { type: "string" },
                indicativeValuation: { type: ["string", "null"] },
              },
              required: ["name", "whyRelevant", "indicativeValuation"],
              additionalProperties: false,
            },
          },
          whatMovesTheNumber: {
            type: "array",
            items: {
              type: "object",
              properties: {
                lever: { type: "string" },
                estimatedImpactPct: { type: "number" },
              },
              required: ["lever", "estimatedImpactPct"],
              additionalProperties: false,
            },
          },
          recommendedRaise: {
            type: ["object", "null"],
            properties: {
              amountUsd: { type: "number" },
              rationale: { type: "string" },
            },
            required: ["amountUsd", "rationale"],
            additionalProperties: false,
          },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
        },
        required: [
          "summary",
          "strengths",
          "risks",
          "comparables",
          "whatMovesTheNumber",
          "recommendedRaise",
          "confidence",
        ],
        additionalProperties: false,
      },
      disclaimer: { type: "string" },
    },
    required: ["adjustmentPct", "adjustmentRationale", "finalPreMoneyUsd", "memo", "disclaimer"],
    additionalProperties: false,
  },
};
