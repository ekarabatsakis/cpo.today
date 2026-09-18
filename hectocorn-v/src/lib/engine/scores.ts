import { clamp, lastRound, runwayMonths, totalRaisedUsd } from "./helpers";
import type { Scores } from "./types";
import type { StartupInput } from "@/lib/schema/startup";

const PRODUCT_SCORE = { concept: 15, prototype: 35, mvp: 55, launched: 75, scaling: 90 } as const;
const DEFENSIBILITY_SCORE = { low: 25, medium: 50, high: 75 } as const;

/** Market score from TAM. Missing TAM → neutral 50 (an AI estimate may fill it later). */
export function marketScoreFromTam(tamUsd: number | undefined): number {
  if (tamUsd === undefined) return 50;
  if (tamUsd < 500e6) return 30;
  if (tamUsd < 2e9) return 50;
  if (tamUsd < 10e9) return 70;
  return 85;
}

/**
 * Seven 0–100 scores derived deterministically from the inputs (§5.3).
 * The AI scorer may later override them; the engine keeps both.
 */
export function scoreFromInputs(input: StartupInput): Scores {
  const { team, traction, ip, market, risks, financials } = input;

  const teamScore =
    40 +
    (team.technicalCofounder ? 10 : 0) +
    15 * Math.min(team.foundersWithPriorExit, 2) +
    2 * Math.min(team.foundersWithDomainYears, 15) +
    3 * Math.min(team.advisorsNotable, 3) -
    (risks.keyPersonDependency ? 15 : 0);

  let marketScore = marketScoreFromTam(market.tamUsd);
  if ((market.marketCagrPct ?? 0) >= 15) marketScore += 10;
  if (ip.regulatoryTailwind) marketScore += 10;
  if (market.competitiveIntensity === "high") marketScore -= 10;

  const productScore = PRODUCT_SCORE[ip.productStage] + Math.min(5 * ip.certifications.length, 15);

  const customers = traction.payingCustomers;
  let tractionScore: number;
  if (customers === 0) {
    tractionScore = 10;
  } else {
    tractionScore =
      30 +
      8 * Math.min(customers, 5) +
      (customers > 5 ? 4 * Math.min(customers - 5, 10) : 0) +
      (traction.arrUsd > 0 ? 15 : 0) +
      ((traction.momGrowthPct ?? -Infinity) >= 10 ? 10 : 0) +
      5 * Math.min(traction.marqueeCustomers.length, 2) +
      ((traction.netRevenueRetentionPct ?? -Infinity) >= 100 ? 5 : 0);
  }

  const moatScore =
    DEFENSIBILITY_SCORE[ip.techDefensibility] +
    (ip.patentsGranted > 0 ? 10 : 0) +
    (ip.patentsPending > 0 ? 5 : 0) +
    (ip.proprietaryData ? 10 : 0) +
    (ip.trademarksRegistered ? 5 : 0) -
    (risks.hardwareSupplyRisk ? 10 : 0);

  const runway = runwayMonths(input);
  let financialScore = 50;
  if (runway >= 18) financialScore += 10;
  else if (runway < 6) financialScore -= 15;
  if (traction.grossMarginPct !== undefined) {
    if (traction.grossMarginPct >= 70) financialScore += 10;
    else if (traction.grossMarginPct < 40) financialScore -= 10;
  }
  if (financials.isProfitable) financialScore += 10;
  if ((traction.churnAnnualPct ?? 0) > 15) financialScore -= 15;

  const last = lastRound(input);
  let dealScore = 50;
  if (last?.leadInvestorType === "vc") dealScore += 15;
  if (totalRaisedUsd(input) >= 500_000) dealScore += 10;
  dealScore += Math.min(5 * traction.partnerships.length, 15);
  if ((risks.singleCustomerConcentrationPct ?? 0) > 50) dealScore -= 10;

  return {
    team: clamp(teamScore, 0, 100),
    market: clamp(marketScore, 0, 100),
    product: clamp(productScore, 0, 100),
    traction: clamp(tractionScore, 0, 100),
    moat: clamp(moatScore, 0, 100),
    financial: clamp(financialScore, 0, 100),
    deal: clamp(dealScore, 0, 100),
  };
}
