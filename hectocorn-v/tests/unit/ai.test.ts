import { describe, expect, it } from "vitest";
import { applyAdjustment } from "@/lib/ai/memo";
import { needsMarketEstimate } from "@/lib/ai/market";
import { webSearchToolType, getAiConfig } from "@/lib/ai/client";
import { SCORE_TOOL, MARKET_TOOL, MEMO_TOOL, MemoOutput, AiScoreOutput } from "@/lib/ai/schemas";
import { rateLimit } from "@/lib/rate-limit";
import { plugSecure } from "@/lib/schema/examples";

describe("bounded AI adjustment (server recomputes)", () => {
  it("applies an in-band adjustment exactly", () => {
    const r = applyAdjustment(3_000_000, 10);
    expect(r.appliedPct).toBe(10);
    expect(r.clamped).toBe(false);
    expect(r.finalPreMoneyUsd).toBe(3_300_000);
  });

  it("clamps to ±25% and flags it", () => {
    expect(applyAdjustment(1_000_000, 40)).toEqual({
      appliedPct: 25,
      clamped: true,
      finalPreMoneyUsd: 1_250_000,
    });
    expect(applyAdjustment(1_000_000, -60)).toEqual({
      appliedPct: -25,
      clamped: true,
      finalPreMoneyUsd: 750_000,
    });
  });

  it("zero adjustment leaves the engine number untouched", () => {
    expect(applyAdjustment(3_136_000, 0).finalPreMoneyUsd).toBe(3_136_000);
  });
});

describe("AI tool schemas", () => {
  it("are strict with additionalProperties false and required lists", () => {
    for (const t of [SCORE_TOOL, MARKET_TOOL, MEMO_TOOL]) {
      expect(t.strict).toBe(true);
      const schema = t.input_schema as {
        additionalProperties?: boolean;
        required?: string[];
        properties: Record<string, unknown>;
      };
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required?.sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });

  it("zod validators reject out-of-range scores and accept nullable memo fields", () => {
    const entry = { score: 50, rationale: "fine" };
    const good = {
      team: entry,
      market: entry,
      product: entry,
      traction: entry,
      moat: entry,
      financial: entry,
      deal: entry,
      notableSignals: [],
    };
    expect(AiScoreOutput.safeParse(good).success).toBe(true);
    expect(AiScoreOutput.safeParse({ ...good, team: { score: 120, rationale: "x" } }).success).toBe(
      false,
    );
    const memo = {
      adjustmentPct: 5,
      adjustmentRationale: "because",
      finalPreMoneyUsd: 1,
      memo: {
        summary: "s",
        strengths: [],
        risks: [],
        comparables: [{ name: "a", whyRelevant: "b", indicativeValuation: null }],
        whatMovesTheNumber: [],
        recommendedRaise: null,
        confidence: 60,
      },
      disclaimer: "d",
    };
    expect(MemoOutput.safeParse(memo).success).toBe(true);
  });
});

describe("market estimation trigger and config", () => {
  it("runs only when TAM/SAM/SOM are incomplete", () => {
    expect(needsMarketEstimate(plugSecure())).toBe(true);
    const full = plugSecure();
    full.market = { ...full.market, tamUsd: 1e9, samUsd: 1e8, somUsd: 1e7 };
    expect(needsMarketEstimate(full)).toBe(false);
  });

  it("picks the web-search tool variant by model generation", () => {
    expect(webSearchToolType("claude-sonnet-4-6")).toBe("web_search_20260209");
    expect(webSearchToolType("claude-opus-5")).toBe("web_search_20260209");
    expect(webSearchToolType("claude-haiku-4-5")).toBe("web_search_20250305");
  });

  it("is disabled without an API key and defaults to claude-sonnet-4-6", () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    const prevModel = process.env.ANTHROPIC_MODEL;
    process.env.ANTHROPIC_API_KEY = "";
    delete process.env.ANTHROPIC_MODEL;
    const cfg = getAiConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.model).toBe("claude-sonnet-4-6");
    expect(cfg.temperature).toBe(0.2);
    process.env.ANTHROPIC_API_KEY = prev;
    if (prevModel !== undefined) process.env.ANTHROPIC_MODEL = prevModel;
  });
});

describe("rate limit", () => {
  it("allows 10 per minute per key, then rejects with a retry-after", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 10; i++) expect(rateLimit(key, 10, 60_000).ok).toBe(true);
    const blocked = rateLimit(key, 10, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit(`${key}:other`, 10, 60_000).ok).toBe(true);
  });
});
