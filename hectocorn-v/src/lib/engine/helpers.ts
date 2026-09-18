import type { StartupInput, FundingRound } from "@/lib/schema/startup";

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
export const round = (v: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Months of runway: cash / max(burn, 1). */
export function runwayMonths(input: StartupInput): number {
  return input.financials.cashOnHandUsd / Math.max(input.financials.monthlyBurnUsd, 1);
}

/** Total raised: the declared total or the sum of rounds, whichever is larger. */
export function totalRaisedUsd(input: StartupInput): number {
  const fromRounds = input.funding.rounds.reduce((s, r) => s + r.amountUsd, 0);
  return Math.max(input.funding.totalRaisedUsd, fromRounds);
}

/** The most recent round that carries a post-money valuation. */
export function lastPricedRound(input: StartupInput): FundingRound | undefined {
  const priced = input.funding.rounds.filter((r) => typeof r.postMoneyUsd === "number");
  if (priced.length === 0) return undefined;
  return [...priced].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).at(-1);
}

/** The most recent round of any kind. */
export function lastRound(input: StartupInput): FundingRound | undefined {
  if (input.funding.rounds.length === 0) return undefined;
  return [...input.funding.rounds].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).at(-1);
}

export function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.4375);
}

export function yearsBetween(from: Date, to: Date): number {
  return monthsBetween(from, to) / 12;
}

export function parseIsoDate(value: string): Date | undefined {
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t);
}
