import { AI_ADJUSTMENT_MAX_PCT } from "@/lib/engine/benchmarks";
import type { EngineResult, Scores } from "@/lib/engine/types";
import { schemaDescriptions, type StartupInput } from "@/lib/schema/startup";
import type { AiScoreResult, MarketEstimate } from "./schemas";

/** Bump when any prompt changes; stored on every report row. */
export const PROMPT_VERSION = "2026.09.1";

const INVESTOR_PERSONA = `You are a partner at a European seed-stage venture fund. You are sceptical, benchmark-aware and allergic to founder hype. You have seen thousands of decks and know 2025–2026 early-stage medians in Europe and the US. You explicitly reward three things that the market under-prices: (1) regulatory tailwinds that force customers to buy (NIS2, CRA, DORA, AI Act, similar), (2) hard-to-replicate OT, deep-tech or infrastructure technology, and (3) paying B2B logos, especially regulated or industrial customers. You penalise vague narratives, unverifiable claims, missing financials and single points of failure.`;

export const SCORER_SYSTEM = `${INVESTOR_PERSONA}

Your task: review a startup profile and return seven qualitative scores from 0 to 100 (team, market, product, traction, moat, financial, deal), each with a one-sentence rationale, plus a short list of notable signals.

Rules:
- A deterministic scoring formula has already produced a baseline for each score. Stay within ±20 points of the baseline unless the narrative, named customers, named partners or other concrete facts justify more. If you go beyond ±20, say why in the rationale.
- Never reward claims that are not in the input. Zero values for ARR, burn or cash are placeholders the founder has not filled in; note that as a signal but do not invent numbers.
- Scores are absolute, not relative to the baseline: 50 is an average company at this stage, 80+ is top-decile.
- Respond only by calling the submit_scores tool.`;

export const MARKET_SYSTEM = `${INVESTOR_PERSONA}

Your task: estimate TAM, SAM and SOM for the startup below, in USD per year, plus the market CAGR.

Rules:
- TAM is the global annual spend on the category; SAM is the part reachable with the current product, geography and business model.
- SOM must be derived bottom-up: the number of customers the company can realistically win in 5 years × the annual contract value it can charge them. Never compute SOM as a percentage of TAM. Show the arithmetic in the method field.
- Prefer public market reports and cite them as sources. If you cannot verify a figure, say so and use wide, conservative bands; set confidence accordingly (0–100).
- All amounts in USD. Be conservative: an investor will discount inflated markets.
- Finish by calling the submit_market_estimate tool exactly once with your final numbers.`;

export const MEMO_SYSTEM = `${INVESTOR_PERSONA}

Your task: write an investment memo for the startup below and decide on a bounded adjustment to the deterministic engine's pre-money valuation.

Rules:
- The engine number is the anchor. You may adjust it by at most ±${AI_ADJUSTMENT_MAX_PCT}%. The server clamps anything outside that band and flags it, so do not bother exceeding it. A zero adjustment is a perfectly good answer.
- Justify the adjustment in two or three sentences that reference specific inputs, scores or method results.
- finalPreMoneyUsd must equal enginePreMoneyUsd × (1 + adjustmentPct / 100). The server recomputes it and ignores your arithmetic if it differs.
- Comparables: name real companies or transactions you are confident about, say why they are relevant, and give an indicative valuation only if you are reasonably sure; otherwise null.
- whatMovesTheNumber: concrete levers the founder controls, each with a rough % impact on valuation.
- recommendedRaise: an amount and rationale consistent with runway, stage and the valuation, or null.
- confidence: 0–100, your confidence in the final number.
- disclaimer: one sentence stating this is an indicative estimate, not investment advice.
- Respond only by calling the submit_memo tool.`;

function trimJson(value: unknown): string {
  return JSON.stringify(value, null, 1);
}

/** Field descriptions + the full normalised input, shared by every prompt. */
export function startupContext(input: StartupInput): string {
  return `## Field descriptions
${trimJson(schemaDescriptions())}

## Startup profile (all amounts in USD)
${trimJson(input)}`;
}

export function scorerUserMessage(input: StartupInput, deterministic: Scores): string {
  return `${startupContext(input)}

## Deterministic baseline scores (0–100)
${trimJson(deterministic)}

Score this startup. Call submit_scores.`;
}

export function marketUserMessage(input: StartupInput): string {
  return `${startupContext(input)}

The founder did not supply TAM/SAM/SOM. Estimate them for: ${input.oneLiner}
Sector: ${input.sector}${input.subSector ? ` (${input.subSector})` : ""}. HQ region: ${input.hqRegion}. Operating countries: ${
    input.operatingCountries.join(", ") || "not given"
  }. Business model: ${input.businessModel}. Paying customers today: ${input.traction.payingCustomers}${
    input.traction.avgContractValueUsd
      ? `, average contract value $${input.traction.avgContractValueUsd}`
      : ""
  }.

When you have your numbers, call submit_market_estimate.`;
}

export function memoUserMessage(
  input: StartupInput,
  engine: EngineResult,
  aiScores: AiScoreResult | undefined,
  market: MarketEstimate | undefined,
): string {
  const methods = engine.methods.map((m) => ({
    method: m.name,
    applicable: m.applicable,
    valuationUsd: m.valuationUsd,
    weight: engine.weights[m.key] ?? 0,
    notes: m.notes,
  }));
  return `${startupContext(input)}

## Engine result (deterministic)
Stage: ${engine.stage} (${engine.stageReason})
Pre-money: $${engine.preMoneyUsd} (range $${engine.lowUsd} – $${engine.highUsd}), confidence ${engine.confidence}/100
Implied post-money: ${engine.impliedPostMoneyUsd ? `$${engine.impliedPostMoneyUsd}` : "n/a"}
Flags: ${engine.flags.join(", ") || "none"}
Market ceiling: ${engine.marketCeilingUsd ? `$${engine.marketCeilingUsd}` : "none"}
Scores used (${engine.scoresSource}): ${trimJson(engine.scores)}
Deterministic scores: ${trimJson(engine.deterministicScores)}
Methods:
${trimJson(methods)}

## AI qualitative scores
${aiScores ? trimJson(aiScores) : "not available"}

## Market estimate
${market ? trimJson(market) : input.market.tamUsd ? "supplied by the founder (see profile)" : "not available"}

enginePreMoneyUsd = ${engine.preMoneyUsd}

Write the memo and decide the adjustment. Call submit_memo.`;
}
