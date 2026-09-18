import {
  REGION_FACTOR,
  RFS_POINT_VALUE_USD,
  RFS_REFERENCE_BASE_USD,
  SECTOR_EXIT_MULTIPLE_AT_SCALE,
  STAGE_MEDIAN_PRE_MONEY_USD,
  type Region,
  type Sector,
  type Stage,
} from "../benchmarks";
import { clamp, round, runwayMonths } from "../helpers";
import type { MethodResult, Scores } from "../types";
import { fmt } from "./scorecard";
import type { StartupInput } from "@/lib/schema/startup";

export type RfsRating = -2 | -1 | 0 | 1 | 2;
export interface RfsRisk {
  key: string;
  label: string;
  rating: RfsRating;
  why: string;
}

const asRating = (v: number): RfsRating => clamp(Math.round(v), -2, 2) as RfsRating;

/** Map the inputs onto the twelve Risk-Factor Summation categories (−2 … +2). */
export function rfsRatings(input: StartupInput, scores: Scores): RfsRisk[] {
  const { traction, ip, risks, market, team } = input;
  const runway = runwayMonths(input);
  const paying = traction.payingCustomers;
  const hardwareBased = input.businessModel === "hardware" || input.sector === "deeptech_hardware";
  const exitMultiple = SECTOR_EXIT_MULTIPLE_AT_SCALE[input.sector as Sector];

  const management =
    scores.team >= 80
      ? 2
      : scores.team >= 65
        ? 1
        : scores.team >= 45
          ? 0
          : scores.team >= 30
            ? -1
            : -2;
  const stageRating = { scaling: 2, launched: 1, mvp: 0, prototype: -1, concept: -2 }[
    ip.productStage
  ];
  const legislation = (ip.regulatoryTailwind ? 1 : 0) + (risks.litigationOrRegulatoryRisk ? -1 : 0);
  const manufacturing = risks.hardwareSupplyRisk ? -1 : hardwareBased ? 0 : 1;
  const sales =
    paying >= 10 ? 2 : paying >= 3 ? 1 : paying >= 1 ? 0 : traction.pilotsOrLOIs >= 1 ? -1 : -2;
  let funding = runway >= 24 ? 2 : runway >= 18 ? 1 : runway >= 6 ? 0 : -1;
  if (runway < 6 && !input.funding.currentlyRaising) funding = -2;
  const competition = { low: 1, medium: 0, high: -1 }[market.competitiveIntensity ?? "medium"];
  const technology =
    ({ high: 1, medium: 0, low: -1 }[ip.techDefensibility] ?? 0) + (ip.patentsGranted > 0 ? 1 : 0);
  const litigation = risks.litigationOrRegulatoryRisk ? -2 : 0;
  const countries = input.operatingCountries.length;
  const international = countries >= 6 ? 2 : countries >= 3 ? 1 : 0;
  const reputation =
    (team.foundersWithPriorExit > 0 ? 1 : 0) + (traction.marqueeCustomers.length >= 1 ? 1 : 0);
  const exitPotential = exitMultiple >= 7 ? 1 : exitMultiple <= 4 ? -1 : 0;

  return [
    {
      key: "management",
      label: "Management",
      rating: asRating(management),
      why: `team score ${scores.team}`,
    },
    {
      key: "stage",
      label: "Stage of the business",
      rating: asRating(stageRating),
      why: `product is ${ip.productStage}`,
    },
    {
      key: "legislation",
      label: "Legislation / political",
      rating: asRating(legislation),
      why: `${ip.regulatoryTailwind ? "regulatory tailwind" : "no regulatory tailwind"}${risks.litigationOrRegulatoryRisk ? ", regulatory risk flagged" : ""}`,
    },
    {
      key: "manufacturing",
      label: "Manufacturing / supply",
      rating: asRating(manufacturing),
      why: risks.hardwareSupplyRisk
        ? "hardware supply risk flagged"
        : hardwareBased
          ? "hardware-based business"
          : "software, no supply chain",
    },
    {
      key: "sales",
      label: "Sales & marketing",
      rating: asRating(sales),
      why: `${paying} paying customers, ${traction.pilotsOrLOIs} pilots/LOIs`,
    },
    {
      key: "funding",
      label: "Funding / capital raising",
      rating: asRating(funding),
      why: `${runway.toFixed(0)} months runway${input.funding.currentlyRaising ? ", currently raising" : ""}`,
    },
    {
      key: "competition",
      label: "Competition",
      rating: asRating(competition),
      why: `competitive intensity ${market.competitiveIntensity ?? "not given"}`,
    },
    {
      key: "technology",
      label: "Technology",
      rating: asRating(technology),
      why: `defensibility ${ip.techDefensibility}, ${ip.patentsGranted} patents granted`,
    },
    {
      key: "litigation",
      label: "Litigation",
      rating: asRating(litigation),
      why: risks.litigationOrRegulatoryRisk ? "litigation/regulatory risk flagged" : "none flagged",
    },
    {
      key: "international",
      label: "International",
      rating: asRating(international),
      why: `${countries} operating countries`,
    },
    {
      key: "reputation",
      label: "Reputation",
      rating: asRating(reputation),
      why: `${team.foundersWithPriorExit} founders with a prior exit, ${traction.marqueeCustomers.length} marquee customers`,
    },
    {
      key: "exit",
      label: "Exit potential",
      rating: asRating(exitPotential),
      why: `sector exit multiple ${exitMultiple}× revenue`,
    },
  ];
}

export function rfs(input: StartupInput, stage: Stage, scores: Scores): MethodResult {
  const base = STAGE_MEDIAN_PRE_MONEY_USD[stage] * REGION_FACTOR[input.hqRegion as Region];
  const applicable = stage === "idea" || stage === "pre_seed" || stage === "seed";
  const pointValue = RFS_POINT_VALUE_USD * (base / RFS_REFERENCE_BASE_USD);
  const ratings = rfsRatings(input, scores);
  const points = ratings.reduce((s, r) => s + r.rating, 0);
  const valuation = Math.max(0, base + points * pointValue);

  const inputsUsed: MethodResult["inputsUsed"] = {
    stage,
    baseUsd: round(base),
    pointValueUsd: round(pointValue),
    totalPoints: points,
  };
  for (const r of ratings) inputsUsed[r.key] = r.rating;

  const notes = [
    `Base ${fmt(base)}; each risk point is worth ${fmt(pointValue)} (scaled from $250k at a $2.5M base). Net ${points >= 0 ? "+" : ""}${points} points.`,
    ...ratings.map((r) => `${r.label}: ${r.rating > 0 ? "+" : ""}${r.rating} (${r.why})`),
  ];
  if (!applicable) notes.push("Not applicable beyond seed stage.");

  return {
    key: "rfs",
    name: "Risk-Factor Summation",
    valuationUsd: applicable ? round(valuation) : 0,
    applicable,
    weightHint: 1,
    inputsUsed,
    notes,
  };
}
