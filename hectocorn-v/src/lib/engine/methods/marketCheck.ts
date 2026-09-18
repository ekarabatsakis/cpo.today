import { MARKET_CEILING_SOM_MULTIPLE } from "../benchmarks";
import { round } from "../helpers";
import type { MarketCheckResult } from "../types";
import { fmt } from "./scorecard";
import type { StartupInput } from "@/lib/schema/startup";

/**
 * Market-size cross-check: not a valuation method, a sanity band.
 * ceiling = SOM × 3; floor = 0. Returns the band and whether the blended
 * number exceeds it (the caller caps and flags).
 */
export function marketCheck(input: StartupInput, blendedUsd: number): MarketCheckResult {
  const { tamUsd, samUsd, somUsd } = input.market;
  const missing = tamUsd === undefined || samUsd === undefined || somUsd === undefined;
  const notes: string[] = [];
  if (missing) {
    notes.push(
      "TAM/SAM/SOM not fully supplied. An AI estimate is requested when the AI layer is available.",
    );
  }
  if (somUsd === undefined) {
    return {
      floorUsd: 0,
      applied: false,
      missing,
      notes: [...notes, "No SOM: no ceiling applied."],
    };
  }
  const ceilingUsd = round(somUsd * MARKET_CEILING_SOM_MULTIPLE);
  const applied = blendedUsd > ceilingUsd;
  notes.push(
    `Ceiling = SOM ${fmt(somUsd)} × ${MARKET_CEILING_SOM_MULTIPLE} = ${fmt(ceilingUsd)}${
      applied ? `; the blended ${fmt(blendedUsd)} exceeds it and is capped` : "; not binding"
    }.`,
  );
  return { ceilingUsd, floorUsd: 0, applied, missing, notes };
}
